using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace Launcher.API
{
    public sealed class PayloadDelivery : IDisposable
    {
        private readonly HttpClient _http;

        public PayloadDelivery(HttpClient? httpClient = null)
        {
            _http = httpClient ?? new HttpClient();
        }

        public void Dispose()
        {
            _http.Dispose();
        }

        public sealed record ManifestFile(string Id, string Name);
        public sealed record Manifest(string? Version, List<ManifestFile> Files);

        public sealed record KeyResponse(string KeyB64, int? ExpiresInSec);

        public sealed record TempPayloadFolder(string FolderPath, string ClientDllPath);

        public async Task<TempPayloadFolder> DownloadDecryptToTempFolderAsync(
            string functionsBaseUrl,
            string bearerAccessToken,
            CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(functionsBaseUrl))
                throw new ArgumentException("Supabase functions base URL is required.", nameof(functionsBaseUrl));
            if (string.IsNullOrWhiteSpace(bearerAccessToken))
                throw new ArgumentException("Bearer access token is required.", nameof(bearerAccessToken));

            functionsBaseUrl = functionsBaseUrl.TrimEnd('/');

            var manifest = await GetManifestAsync(functionsBaseUrl, bearerAccessToken, ct);
            if (manifest.Files.Count == 0)
                throw new Exception("Manifest contains no files.");

            var key = await GetKeyAsync(functionsBaseUrl, bearerAccessToken, ct);
            byte[] aesKey = Convert.FromBase64String(key.KeyB64);
            if (aesKey.Length != 32)
                throw new Exception($"Invalid AES key length: {aesKey.Length} (expected 32).");

            string tempFolder = Path.Combine(Path.GetTempPath(), $"hades-payload-{Guid.NewGuid():N}");
            Directory.CreateDirectory(tempFolder);

            try
            {
                foreach (var f in manifest.Files)
                {
                    byte[] enc = await GetEncryptedFileAsync(functionsBaseUrl, bearerAccessToken, f.Id, ct);
                    byte[] plain = DecryptAes256Gcm(enc, aesKey);
                    string outPath = Path.Combine(tempFolder, f.Name);
                    await File.WriteAllBytesAsync(outPath, plain, ct);
                }

                string clientPath = Path.Combine(tempFolder, "client.dll");
                if (!File.Exists(clientPath))
                {
                    // Fallback: if manifest called it something else, pick first .dll
                    var dlls = Directory.GetFiles(tempFolder, "*.dll", SearchOption.TopDirectoryOnly);
                    if (dlls.Length == 0)
                        throw new Exception("No client DLL found after decrypt (expected client.dll).");
                    clientPath = dlls[0];
                }

                return new TempPayloadFolder(tempFolder, clientPath);
            }
            catch
            {
                TryWipeAndDeleteFolder(tempFolder);
                throw;
            }
        }

        public static void CleanupTempPayload(TempPayloadFolder payload)
        {
            TryWipeAndDeleteFolder(payload.FolderPath);
        }

        private async Task<Manifest> GetManifestAsync(string baseUrl, string token, CancellationToken ct)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/payload-manifest");
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            using var res = await _http.SendAsync(req, ct);
            string json = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                throw new Exception($"Manifest request failed (HTTP {(int)res.StatusCode}): {json}");

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var files = new List<ManifestFile>();
            if (root.TryGetProperty("files", out var filesEl) && filesEl.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in filesEl.EnumerateArray())
                {
                    string id = el.TryGetProperty("id", out var idEl) ? (idEl.GetString() ?? "") : "";
                    string name = el.TryGetProperty("name", out var nameEl) ? (nameEl.GetString() ?? "") : "";
                    if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(name))
                        continue;
                    files.Add(new ManifestFile(id.Trim(), name.Trim()));
                }
            }

            string? version = root.TryGetProperty("version", out var vEl) ? vEl.GetString() : null;
            return new Manifest(version, files);
        }

        private async Task<KeyResponse> GetKeyAsync(string baseUrl, string token, CancellationToken ct)
        {
            using var req = new HttpRequestMessage(HttpMethod.Post, $"{baseUrl}/payload-key");
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            req.Content = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
            using var res = await _http.SendAsync(req, ct);
            string json = await res.Content.ReadAsStringAsync(ct);
            if (!res.IsSuccessStatusCode)
                throw new Exception($"Key request failed (HTTP {(int)res.StatusCode}): {json}");

            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            string keyB64 = root.TryGetProperty("key_b64", out var kEl) ? (kEl.GetString() ?? "") : "";
            int? exp = null;
            if (root.TryGetProperty("expires_in_sec", out var eEl) && eEl.ValueKind == JsonValueKind.Number)
                exp = eEl.GetInt32();
            if (string.IsNullOrWhiteSpace(keyB64))
                throw new Exception("Key response missing key_b64.");
            return new KeyResponse(keyB64, exp);
        }

        private async Task<byte[]> GetEncryptedFileAsync(string baseUrl, string token, string id, CancellationToken ct)
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{baseUrl}/payload-file?id={Uri.EscapeDataString(id)}");
            req.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            using var res = await _http.SendAsync(req, ct);
            if (!res.IsSuccessStatusCode)
            {
                string err = await res.Content.ReadAsStringAsync(ct);
                throw new Exception($"File request failed for '{id}' (HTTP {(int)res.StatusCode}): {err}");
            }
            return await res.Content.ReadAsByteArrayAsync(ct);
        }

        private static byte[] DecryptAes256Gcm(byte[] blob, byte[] key)
        {
            if (blob.Length < 12 + 16)
                throw new Exception("Encrypted blob too short.");

            var nonce = new byte[12];
            Buffer.BlockCopy(blob, 0, nonce, 0, 12);

            var tag = new byte[16];
            Buffer.BlockCopy(blob, blob.Length - 16, tag, 0, 16);

            int cipherLen = blob.Length - 12 - 16;
            var cipher = new byte[cipherLen];
            Buffer.BlockCopy(blob, 12, cipher, 0, cipherLen);

            var plain = new byte[cipherLen];
            using var gcm = new AesGcm(key, 16);
            gcm.Decrypt(nonce, cipher, tag, plain);
            return plain;
        }

        private static void TryWipeAndDeleteFolder(string folder)
        {
            try
            {
                if (!Directory.Exists(folder))
                    return;

                foreach (var file in Directory.GetFiles(folder, "*", SearchOption.TopDirectoryOnly))
                {
                    try
                    {
                        BestEffortWipeFile(file);
                        File.Delete(file);
                    }
                    catch { /* ignore */ }
                }
                try { Directory.Delete(folder, true); } catch { /* ignore */ }
            }
            catch { /* ignore */ }
        }

        private static void BestEffortWipeFile(string path)
        {
            try
            {
                var fi = new FileInfo(path);
                if (!fi.Exists || fi.Length <= 0)
                    return;

                // Best effort: overwrite with zeros once. (Not guaranteed on SSDs/filesystems.)
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Write, FileShare.Read);
                byte[] zeros = new byte[8192];
                long remaining = fs.Length;
                fs.Position = 0;
                while (remaining > 0)
                {
                    int toWrite = (int)Math.Min(zeros.Length, remaining);
                    fs.Write(zeros, 0, toWrite);
                    remaining -= toWrite;
                }
                fs.Flush(true);
            }
            catch
            {
                // ignore
            }
        }
    }
}

