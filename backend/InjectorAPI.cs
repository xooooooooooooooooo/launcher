using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;

namespace Launcher.API
{
    /// <summary>
    /// Simple HTTP API server for the injector
    /// This allows any frontend (including web-based) to communicate with the C# backend
    /// </summary>
    public class InjectorAPI
    {
        public const string ApiVersion = "10.0.2";
        private HttpListener? listener;
        private bool isRunning;
        private static readonly HttpClient Http = new HttpClient();

        /// <summary>
        /// Returns the full path to the DLL folder (next to the executable or in project folder).
        /// </summary>
        private static string GetDllFolderPath()
        {
            // Store payloads in a per-user hidden folder to avoid cluttering the project directory.
            // Example: C:\Users\<user>\.hades
            string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            string userHades = Path.Combine(userProfile, ".hades");

            try
            {
                Directory.CreateDirectory(userHades);
                return Path.GetFullPath(userHades);
            }
            catch
            {
                // Fallback to previous behavior if the user profile folder is not writable.
                string nextToExe = Path.Combine(AppContext.BaseDirectory, "dll");
                if (Directory.Exists(nextToExe))
                    return Path.GetFullPath(nextToExe);

                string inCwd = Path.Combine(Directory.GetCurrentDirectory(), "dll");
                if (Directory.Exists(inCwd))
                    return Path.GetFullPath(inCwd);

                return Path.GetFullPath(nextToExe);
            }
        }

        public void Start(int port = 5000)
        {
            listener = new HttpListener();
            listener.Prefixes.Add($"http://localhost:{port}/");
            listener.Start();
            isRunning = true;

            Console.WriteLine($"Injector API running on http://localhost:{port}");

            Task.Run(() => HandleRequests());
        }

        public void Stop()
        {
            isRunning = false;
            listener?.Stop();
        }

        private async Task HandleRequests()
        {
            while (isRunning && listener != null)
            {
                try
                {
                    var context = await listener.GetContextAsync();
                    await ProcessRequest(context);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error handling request: {ex.Message}");
                }
            }
        }

        private async Task ProcessRequest(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;

            // Enable CORS for frontend access
            response.AddHeader("Access-Control-Allow-Origin", "*");
            response.AddHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            try
            {
                string responseString = "";

                switch (request.Url?.AbsolutePath)
                {
                    case "/":
                    case "/api/health":
                        responseString = GetStatus();
                        break;

                    case "/api/processes":
                        responseString = GetProcesses();
                        break;

                    case "/api/inject":
                        responseString = await InjectDLL(request);
                        break;

                    case "/api/status":
                        responseString = GetStatus();
                        break;

                    case "/api/dlls":
                        responseString = GetDlls();
                        break;

                    case "/api/check-file":
                        responseString = await CheckFileExists(request);
                        break;

                    case "/api/inject-remote":
                        responseString = await InjectRemotePayload(request);
                        break;

                    default:
                        response.StatusCode = 404;
                        responseString = JsonSerializer.Serialize(new { error = "Endpoint not found" });
                        break;
                }

                byte[] buffer = Encoding.UTF8.GetBytes(responseString);
                response.ContentLength64 = buffer.Length;
                response.ContentType = "application/json";
                await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
            }
            catch (Exception ex)
            {
                response.StatusCode = 500;
                var error = JsonSerializer.Serialize(new { error = ex.Message });
                byte[] buffer = Encoding.UTF8.GetBytes(error);
                await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
            }
            finally
            {
                response.Close();
            }
        }

        private string GetProcesses()
        {
            try
            {
                var processes = Injector.GetJavawProcesses()
                    .Select(p => new
                    {
                        pid = p.Id,
                        name = p.ProcessName,
                        displayName = $"{p.ProcessName} (PID: {p.Id})",
                        mainWindowTitle = p.MainWindowTitle ?? ""
                    })
                    .ToList();

                return JsonSerializer.Serialize(new
                {
                    success = true,
                    processes = processes
                });
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        private async Task<string> InjectDLL(HttpListenerRequest request)
        {
            string? tempDllPathToDelete = null;
            try
            {
                string? auth = request.Headers["Authorization"];
                if (string.IsNullOrWhiteSpace(auth) || !auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    return JsonSerializer.Serialize(new
                    {
                        success = false,
                        message = "Unauthorized: missing Authorization bearer token"
                    });
                }

                Console.WriteLine("\n[INJECT] Received /api/inject request");
                string bearerToken = auth.Substring("Bearer ".Length).Trim();
                
                // Security: Verify the token and subscription status directly with Supabase Edge Functions.
                try 
                {
                    Console.WriteLine("[INJECT] Verifying subscription with Supabase Edge Function...");
                    using var req = new HttpRequestMessage(HttpMethod.Post, "https://szxxwxwityixqzzmarlq.supabase.co/functions/v1/launcher-check-subscription");
                    req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
                    req.Content = new StringContent("{}", Encoding.UTF8, "application/json"); 
                    var verifyResponse = await Http.SendAsync(req);
                    
                    Console.WriteLine($"[INJECT] Edge Function response status: {verifyResponse.StatusCode}");
                    if (!verifyResponse.IsSuccessStatusCode)
                    {
                        return JsonSerializer.Serialize(new { success = false, message = "Unauthorized: Invalid token or expired session." });
                    }
                    
                    string verifyJson = await verifyResponse.Content.ReadAsStringAsync();
                    using var verifyDoc = JsonDocument.Parse(verifyJson);
                    if (!verifyDoc.RootElement.TryGetProperty("active", out var activeProp) || !activeProp.GetBoolean())
                    {
                        return JsonSerializer.Serialize(new { success = false, message = "Unauthorized: No active subscription." });
                    }
                    Console.WriteLine("[INJECT] Subscription verified as active.");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[INJECT-ERROR] Security verification failed: {ex.Message}");
                    return JsonSerializer.Serialize(new { success = false, message = "Security verification failed: " + ex.Message });
                }

                // Read request body securely without StreamReader async deadlocks
                Console.WriteLine("[INJECT] Beginning to stream raw HTTP request bytes...");
                using var ms = new MemoryStream();
                request.InputStream.CopyTo(ms); // Stream directly to memory, completely bypassing HttpListener character buffering bugs
                byte[] requestBytes = ms.ToArray();
                string json = Encoding.UTF8.GetString(requestBytes);
                Console.WriteLine($"[INJECT] Successfully parsed {requestBytes.Length / 1024} KB of JSON!");
                
                var data = JsonSerializer.Deserialize<JsonElement>(json);
                Console.WriteLine("[INJECT] JSON deserialized successfully.");
                int processId = 0;
                if (data.TryGetProperty("processId", out var pidProp) && pidProp.ValueKind == JsonValueKind.Number)
                {
                    processId = pidProp.GetInt32();
                }
                else if (data.TryGetProperty("pid", out var pidAltProp) && pidAltProp.ValueKind == JsonValueKind.Number)
                {
                    processId = pidAltProp.GetInt32();
                }
                else if (data.TryGetProperty("processName", out var procNameProp) && procNameProp.ValueKind == JsonValueKind.String)
                {
                    string? processName = procNameProp.GetString();
                    if (!string.IsNullOrWhiteSpace(processName))
                    {
                        processName = processName.Trim();
                        if (processName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                            processName = processName[..^4];

                        // Prefer exact match first; if multiple, pick the first.
                        var procs = Process.GetProcessesByName(processName);
                        var proc = procs.FirstOrDefault();
                        if (proc != null)
                            processId = proc.Id;
                    }
                }

                if (processId <= 0)
                {
                    return JsonSerializer.Serialize(new
                    {
                        success = false,
                        message = "processId (or pid/processName) is required"
                    });
                }
                string? dllPath = data.TryGetProperty("dllPath", out var pathProp) ? pathProp.GetString() : null;
                string? dllName = data.TryGetProperty("dllName", out var nameProp) ? nameProp.GetString() : null;
                string? dllBytesBase64 = data.TryGetProperty("dllBytesBase64", out var bytesProp) ? bytesProp.GetString() : null;
                bool ephemeral = data.TryGetProperty("ephemeral", out var ephProp) &&
                                 (ephProp.ValueKind == JsonValueKind.True || ephProp.ValueKind == JsonValueKind.False) &&
                                 ephProp.GetBoolean();

                // If a dllName is provided (normal flow), resolve it under the dll folder.
                if (!string.IsNullOrEmpty(dllName))
                {
                    string dllFolder = GetDllFolderPath();
                    if (!Directory.Exists(dllFolder))
                    {
                        return JsonSerializer.Serialize(new { success = false, error = "DLL folder not found: " + dllFolder });
                    }
                    dllPath = Path.Combine(dllFolder, dllName);
                }

                if (string.IsNullOrEmpty(dllPath))
                {
                    return JsonSerializer.Serialize(new
                    {
                        success = false,
                        error = "DLL path or dllName is required"
                    });
                }

                // Support frontend sending the DLL in-memory as Base64
                if (!string.IsNullOrWhiteSpace(dllBytesBase64))
                {
                    try
                    {
                        byte[] dllBytes = Convert.FromBase64String(dllBytesBase64);

                        // Ephemeral Mode: True Manual Mapping (Pure Memory Injection)
                        // The DLL NEVER touches the disk and is invisible to tools like Process Hacker.
                        if (ephemeral)
                        {
                            try
                            {
                                // TEMPORARY OVERRIDE: Skip Bleak Manual Map to test DLL compatibility
                                // bool injected = Injector.InjectDLLFromMemory(processId, dllBytes);
                                // return JsonSerializer.Serialize(new ...);
                            }
                            catch (Exception mmEx)
                            {
                                Console.WriteLine($"[WARNING] True Manual Mapping failed: {mmEx.Message}");
                                Console.WriteLine("[INFO] Fast-Falling back to Ephemeral Temp Injection...");
                                
                                // Fallback: Write securely to the unified .hades directory so everything is logically co-located
                                string fallbackDir = GetDllFolderPath();
                                Directory.CreateDirectory(fallbackDir);
                                
                                // Auto-copy MinHook.x64.dll to the .hades sandbox to ensure the target process can resolve it
                                string srcMinHook = Path.Combine(AppContext.BaseDirectory, "dll", "MinHook.x64.dll");
                                string targetMinHook = Path.Combine(fallbackDir, "MinHook.x64.dll");
                                if (File.Exists(srcMinHook)) { try { File.Copy(srcMinHook, targetMinHook, true); } catch {} }
                                
                                // Dynamically fetch the absolute newest Java payload JAR from the Supabase edge function matching the new API spec
                                string targetJar = Path.Combine(fallbackDir, "preview-sdk.jar");
                                try 
                                {
                                    using var jarReq = new HttpRequestMessage(HttpMethod.Post, "https://szxxwxwityixqzzmarlq.supabase.co/functions/v1/launcher-jar-download");
                                    jarReq.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
                                    jarReq.Content = new StringContent("{}", Encoding.UTF8, "application/json");
                                    
                                    var jarRes = await Http.SendAsync(jarReq);
                                    if (jarRes.IsSuccessStatusCode)
                                    {
                                        string jarJson = await jarRes.Content.ReadAsStringAsync();
                                        using var jarDoc = JsonDocument.Parse(jarJson);
                                        if (jarDoc.RootElement.TryGetProperty("url", out var urlProp) && !string.IsNullOrWhiteSpace(urlProp.GetString()))
                                        {
                                            Console.WriteLine("[INJECT] Located dynamic JAR signed URL. Downloading into backend sandbox...");
                                            byte[] jarBytes = await Http.GetByteArrayAsync(urlProp.GetString());
                                            File.WriteAllBytes(targetJar, jarBytes);
                                            Console.WriteLine($"[INJECT] Dynamic JAR successfully assembled into .hades ({jarBytes.Length} bytes).");
                                        }
                                    }
                                } 
                                catch (Exception ej) { Console.WriteLine($"[WARNING] Could not fetch dynamic JAR payload: {ej.Message}"); }

                                // Use the exact filename from the frontend (e.g., hades.dll) because many C++ cheats 
                                // instantly crash if GetModuleHandle() doesn't match their hardcoded compiled name!
                                string targetName = !string.IsNullOrWhiteSpace(dllName) ? dllName : "hades.dll";
                                string fallbackPath = Path.Combine(fallbackDir, targetName);
                                File.WriteAllBytes(fallbackPath, dllBytes);
                                
                                bool fallbackInjected = false;
                                try
                                {
                                    fallbackInjected = Injector.InjectDLL(processId, fallbackPath);
                                }
                                finally
                                {
                                    // Give the target process exactly 2.5 seconds to finish calling LoadLibrary on the temp file, then permanently delete it
                                    _ = Task.Run(async () => 
                                    {
                                        await Task.Delay(2500); 
                                        try { File.Delete(fallbackPath); } catch { /* Ignore locked errors */ }
                                    });
                                }

                                return JsonSerializer.Serialize(new
                                {
                                    success = fallbackInjected,
                                    message = fallbackInjected ? $"Manual Map blocked. Successfully injected using Ephemeral Fallback." : "Both Manual Map and Fallback failed!"
                                });
                            }
                        }

                        // Normal Mode: Fallback to disk write
                        if (string.IsNullOrWhiteSpace(dllName) && string.IsNullOrWhiteSpace(pathProp.GetString()))
                        {
                            string dllFolder = GetDllFolderPath();
                            Directory.CreateDirectory(dllFolder);
                            dllName = "payload-from-frontend.dll";
                            dllPath = Path.Combine(dllFolder, dllName);
                        }

                        Directory.CreateDirectory(Path.GetDirectoryName(dllPath)!);
                        File.WriteAllBytes(dllPath, dllBytes);
                    }
                    catch (Exception ex)
                    {
                        return JsonSerializer.Serialize(new { success = false, message = "Payload processing failed: " + ex.Message });
                    }
                }

                // Perform injection
                Console.WriteLine($"[INJECT] Calling Injector.InjectDLL with PID: {processId} and Path: {dllPath}");
                bool success = Injector.InjectDLL(processId, dllPath);
                Console.WriteLine($"[INJECT] Injector.InjectDLL returned: {success}");

                return JsonSerializer.Serialize(new
                {
                    success = success,
                    message = success ? "Injection successful!" : "Injection failed"
                });
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[INJECT-FATAL] Uncaught Exception: {ex.Message}\n{ex.StackTrace}");
                return JsonSerializer.Serialize(new
                {
                    success = false,
                    message = ex.Message,
                    error = ex.Message
                });
            }
            finally
            {
                if (!string.IsNullOrWhiteSpace(tempDllPathToDelete))
                {
                    try { File.Delete(tempDllPathToDelete); } catch { /* ignore */ }
                }
            }
        }

        private async Task<string> CheckFileExists(HttpListenerRequest request)
        {
            try
            {
                if (request.HttpMethod != "POST")
                {
                    return JsonSerializer.Serialize(new { success = false, message = "Method not allowed" });
                }

                using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
                string json = await reader.ReadToEndAsync();
                var data = JsonSerializer.Deserialize<JsonElement>(json);
                string? filePath = data.TryGetProperty("filePath", out var fp) ? fp.GetString() : null;

                if (string.IsNullOrWhiteSpace(filePath))
                {
                    return JsonSerializer.Serialize(new { success = false, exists = false, message = "filePath is required" });
                }

                bool exists = File.Exists(filePath) || Directory.Exists(filePath);
                return JsonSerializer.Serialize(new { success = true, exists });
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { success = false, exists = false, message = ex.Message });
            }
        }

        private async Task<string> InjectRemotePayload(HttpListenerRequest request)
        {
            if (request.HttpMethod != "POST")
                return JsonSerializer.Serialize(new { success = false, message = "Method not allowed" });

            try
            {
                using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
                string json = await reader.ReadToEndAsync();
                var data = JsonSerializer.Deserialize<JsonElement>(json);

                int processId = data.TryGetProperty("processId", out var pidProp) && pidProp.ValueKind == JsonValueKind.Number
                    ? pidProp.GetInt32()
                    : 0;

                if (processId <= 0)
                    return JsonSerializer.Serialize(new { success = false, message = "processId is required" });

                string? auth = request.Headers["Authorization"];
                if (string.IsNullOrWhiteSpace(auth) || !auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                    return JsonSerializer.Serialize(new { success = false, message = "Missing Authorization Bearer token" });

                string bearerToken = auth.Substring("Bearer ".Length).Trim();

                string? functionsBaseUrl = Environment.GetEnvironmentVariable("SUPABASE_FUNCTIONS_BASE_URL");
                if (string.IsNullOrWhiteSpace(functionsBaseUrl))
                {
                    return JsonSerializer.Serialize(new
                    {
                        success = false,
                        message = "Missing SUPABASE_FUNCTIONS_BASE_URL env var (expected like: https://<project-ref>.supabase.co/functions/v1)"
                    });
                }

                using var delivery = new PayloadDelivery();
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
                var payload = await delivery.DownloadDecryptToTempFolderAsync(functionsBaseUrl, bearerToken, cts.Token);

                try
                {
                    bool ok = Injector.InjectDLL(processId, payload.ClientDllPath);
                    return JsonSerializer.Serialize(new
                    {
                        success = ok,
                        message = ok ? "Remote payload injection successful!" : "Remote payload injection failed"
                    });
                }
                finally
                {
                    PayloadDelivery.CleanupTempPayload(payload);
                }
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new { success = false, message = ex.Message });
            }
        }

        private string GetStatus()
        {
            string dllFolder = GetDllFolderPath();
            bool dllFolderExists = Directory.Exists(dllFolder);
            int dllCount = 0;
            if (dllFolderExists)
            {
                try
                {
                    dllCount = Directory.GetFiles(dllFolder, "*.dll", SearchOption.TopDirectoryOnly).Length;
                }
                catch { /* ignore */ }
            }
            return JsonSerializer.Serialize(new
            {
                success = true,
                version = ApiVersion,
#pragma warning disable CA1416
                hasAdminPrivileges = Injector.HasAdminPrivileges(),
#pragma warning restore CA1416
                dllFolder,
                dllFolderExists,
                dllCount
            });
        }

        private string GetDlls()
        {
            try
            {
                string dllFolder = GetDllFolderPath();
                if (!Directory.Exists(dllFolder))
                {
                    return JsonSerializer.Serialize(new
                    {
                        success = false,
                        error = "DLL folder not found",
                        dlls = Array.Empty<object>()
                    });
                }
                var dlls = Directory.GetFiles(dllFolder, "*.dll", SearchOption.TopDirectoryOnly)
                    .Select(f =>
                    {
                        var fi = new FileInfo(f);
                        return new { name = fi.Name, path = fi.FullName, size = fi.Length };
                    })
                    .ToList();
                return JsonSerializer.Serialize(new { success = true, dlls });
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new
                {
                    success = false,
                    error = ex.Message,
                    dlls = Array.Empty<object>()
                });
            }
        }
    }
}