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
using System.Text.Json.Serialization;
using System.Collections.Generic;

namespace Launcher.API
{
    public class TargetProcess
    {
        public int pid { get; set; }
        public string name { get; set; } = "";
        public string displayName { get; set; } = "";
        public string mainWindowTitle { get; set; } = "";
    }

    public class ApiResponse
    {
        public bool? success { get; set; }
        public string? message { get; set; }
        public string? error { get; set; }
        public string? status { get; set; }
        public string? version { get; set; }
        public bool? exists { get; set; }
        public List<TargetProcess>? processes { get; set; }
        public List<string>? dlls { get; set; }
        public List<string>? steps { get; set; }
    }

    public class StatusResponse
    {
        public bool success { get; set; }
        public string version { get; set; } = "";
        public bool hasAdminPrivileges { get; set; }
        public string dllFolder { get; set; } = "";
        public bool dllFolderExists { get; set; }
        public int dllCount { get; set; }
    }

    public class DllInfo
    {
        public string name { get; set; } = "";
        public string path { get; set; } = "";
        public long size { get; set; }
    }

    public class DllListResponse 
    {
        public bool success { get; set; }
        public string? error { get; set; }
        public List<DllInfo>? dlls { get; set; }
    }

    [JsonSerializable(typeof(ApiResponse))]
    [JsonSerializable(typeof(StatusResponse))]
    [JsonSerializable(typeof(DllListResponse))]
    [JsonSerializable(typeof(JsonElement))]
    internal partial class AppJsonContext : JsonSerializerContext {}

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

        /// <summary>
        /// Schedules background cleanup of a DLL that is locked by the target process.
        /// Retries every 30s until the game closes and the file can be deleted.
        /// </summary>
        private static void ScheduleDllCleanup(string filePath)
        {
            Console.WriteLine($"  🧹 Scheduled cleanup for: {Path.GetFileName(filePath)}");
            Task.Run(async () =>
            {
                for (int i = 0; i < 20; i++)
                {
                    await Task.Delay(30_000); // wait 30s between retries
                    try
                    {
                        if (File.Exists(filePath))
                        {
                            File.Delete(filePath);
                            Console.WriteLine($"[CLEANUP] Deleted {Path.GetFileName(filePath)} (attempt {i + 1})");
                            return;
                        }
                        return; // already gone
                    }
                    catch { /* still locked, retry */ }
                }
                Console.WriteLine($"[CLEANUP] Gave up deleting {Path.GetFileName(filePath)} after 20 attempts");
            });
        }

        /// <summary>
        /// Cleans up leftover DLLs from previous sessions on startup.
        /// </summary>
        private static void CleanupLeftoverPayloads()
        {
            try
            {
                string hadesDir = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".hades");
                if (!Directory.Exists(hadesDir)) return;
                foreach (var dll in Directory.GetFiles(hadesDir, "*.dll"))
                {
                    try
                    {
                        File.Delete(dll);
                        Console.WriteLine($"[STARTUP] Cleaned up leftover: {Path.GetFileName(dll)}");
                    }
                    catch { /* still in use, skip */ }
                }
            }
            catch { }
        }

        public void Start(int port = 5000)
        {
            listener = new HttpListener();
            listener.Prefixes.Add($"http://localhost:{port}/");
            listener.Start();
            isRunning = true;

            Console.WriteLine($"Injector API running on http://localhost:{port}");
            CleanupLeftoverPayloads();

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
                    _ = Task.Run(() => ProcessRequest(context));
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
                        responseString = JsonSerializer.Serialize(new ApiResponse { error = "Endpoint not found" }, AppJsonContext.Default.ApiResponse);
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
                var error = JsonSerializer.Serialize(new ApiResponse { error = ex.Message }, AppJsonContext.Default.ApiResponse);
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
                    .Select(p => new TargetProcess
                    {
                        pid = p.Id,
                        name = p.ProcessName,
                        displayName = $"{p.ProcessName} (PID: {p.Id})",
                        mainWindowTitle = p.MainWindowTitle ?? ""
                    })
                    .ToList();

                return JsonSerializer.Serialize(new ApiResponse
                {
                    success = true,
                    processes = processes
                }, AppJsonContext.Default.ApiResponse);
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new ApiResponse
                {
                    success = false,
                    error = ex.Message
                }, AppJsonContext.Default.ApiResponse);
            }
        }

        private async Task<string> InjectDLL(HttpListenerRequest request)
        {
            string? tempDllPathToDelete = null;
            var steps = new List<string>();
            var sw = System.Diagnostics.Stopwatch.StartNew();
            void Log(string msg) { steps.Add($"[{sw.ElapsedMilliseconds,5}ms] {msg}"); Console.WriteLine($"  {msg}"); }

            try
            {
                Log("Injection request received");
                string? auth = request.Headers["Authorization"];
                string bearerToken = "";
                if (!string.IsNullOrWhiteSpace(auth) && auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                {
                    bearerToken = auth.Substring("Bearer ".Length).Trim();
                    Log($"Auth token present: {bearerToken}");
                }
                else
                {
                    Log("No auth token provided — proceeding without authentication");
                }

                Console.WriteLine("\n══════════════════════════════════════════════════");
                Console.WriteLine("  INJECTION REQUEST RECEIVED");
                Console.WriteLine("══════════════════════════════════════════════════");
                
                // Read request body securely first to extract the requireSubscription setting
                Log("Reading request body...");
                using var ms = new MemoryStream();
                request.InputStream.CopyTo(ms); // Stream directly to memory, completely bypassing HttpListener character buffering bugs
                byte[] requestBytes = ms.ToArray();
                string json = Encoding.UTF8.GetString(requestBytes);
                Log($"Parsed {requestBytes.Length:N0} bytes of JSON");
                
                using var jsonDoc = JsonDocument.Parse(json);
                var data = jsonDoc.RootElement;
                Console.WriteLine("[INJECT] JSON deserialized successfully.");

                // Security: Verify the token and subscription status directly with Supabase Edge Functions.
                bool requireSubscription = !data.TryGetProperty("requireSubscription", out var reqSubProp) || reqSubProp.GetBoolean();
                
                if (requireSubscription && !string.IsNullOrEmpty(bearerToken))
                {
                    try 
                    {
                        Log("Checking subscription via Edge Function...");
                        using var req = new HttpRequestMessage(HttpMethod.Post, "https://szxxwxwityixqzzmarlq.supabase.co/functions/v1/launcher-check-subscription");
                        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
                        req.Content = new StringContent("{}", Encoding.UTF8, "application/json"); 
                        var verifyResponse = await Http.SendAsync(req);
                        
                        Log($"Subscription check returned: {verifyResponse.StatusCode}");
                        if (verifyResponse.IsSuccessStatusCode)
                        {
                            string verifyJson = await verifyResponse.Content.ReadAsStringAsync();
                            using var verifyDoc = JsonDocument.Parse(verifyJson);
                            if (!verifyDoc.RootElement.TryGetProperty("active", out var activeProp) || !activeProp.GetBoolean())
                            {
                                Log("✘ Subscription is NOT active — blocking injection");
                                return JsonSerializer.Serialize(new ApiResponse { success = false, message = "Unauthorized: No active subscription.", steps = steps }, AppJsonContext.Default.ApiResponse);
                            }
                            Log("✔ Subscription active");
                        }
                        else
                        {
                            Log($"⚠ Subscription check returned {verifyResponse.StatusCode} — proceeding anyway");
                        }
                    }
                    catch (Exception ex)
                    {
                        Log($"⚠ Subscription check network error: {ex.Message} — proceeding anyway");
                    }
                }
                else
                {
                    Log("Subscription check skipped (disabled by settings or no token)");
                }
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
                    return JsonSerializer.Serialize(new ApiResponse
                    {
                        success = false,
                        message = "processId (or pid/processName) is required"
                    }, AppJsonContext.Default.ApiResponse);
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
                        return JsonSerializer.Serialize(new ApiResponse { success = false, error = "DLL folder not found: " + dllFolder }, AppJsonContext.Default.ApiResponse);
                    }
                    dllPath = Path.Combine(dllFolder, dllName);
                }

                if (string.IsNullOrEmpty(dllPath))
                {
                    Log("✘ No DLL path or name provided");
                    return JsonSerializer.Serialize(new ApiResponse
                    {
                        success = false,
                        error = "DLL path or dllName is required",
                        steps = steps
                    }, AppJsonContext.Default.ApiResponse);
                }

                // Support frontend sending the DLL in-memory as Base64
                if (!string.IsNullOrWhiteSpace(dllBytesBase64))
                {
                    try
                    {
                        byte[] dllBytes = Convert.FromBase64String(dllBytesBase64);
                        Log($"Decoded Base64 payload: {dllBytes.Length:N0} bytes ({dllBytes.Length / 1024} KB)");

                        // Ephemeral mode: inject the cloud-downloaded DLL directly
                        if (ephemeral)
                        {
                            string hadesDir = GetDllFolderPath();
                            Directory.CreateDirectory(hadesDir);

                            string payloadName = !string.IsNullOrWhiteSpace(dllName) ? dllName : "hades.dll";
                            string payloadPath = Path.Combine(hadesDir, payloadName);
                            
                            try 
                            {
                                File.WriteAllBytes(payloadPath, dllBytes);
                                Log($"Mode: CLOUD EPHEMERAL");
                                Log($"Written to: {payloadPath} ({dllBytes.Length:N0} bytes)");
                            } 
                            catch (IOException) 
                            {
                                Log($"Mode: CLOUD OVERWRITE LOCKED");
                                Log($"File {payloadName} is currently locked by a process. Proceeding with the existing file on disk.");
                            }
                            Log($"Target: PID {processId}");
                            Log($"Calling LoadLibraryW...");

                            string ephemLog = Path.Combine(hadesDir, "debug.log");
                            File.AppendAllText(ephemLog, $"\n[{DateTime.Now}] Injecting {payloadName} into PID {processId}\n");

                            bool injected = false;
                            try
                            {
                                injected = Injector.InjectDLL(processId, payloadPath);
                            }
                            catch (Exception fx) {
                                Log($"✘ CRASH: {fx.Message}");
                                File.AppendAllText(ephemLog, $"[FATAL CRASH] {fx.Message}\n");
                                throw;
                            }

                            if (injected) {
                                Log("✔ LoadLibraryW succeeded — DLL is loaded in target process");
                                ScheduleDllCleanup(payloadPath);
                                Log("Scheduled deferred cleanup of DLL file");
                            } else {
                                Log("✘ LoadLibraryW returned false — injection failed");
                                Log($"DLL kept at: {payloadPath} for debugging");
                            }

                            File.AppendAllText(ephemLog, $"Injection result: {injected}\n");
                            sw.Stop();
                            Log($"Total time: {sw.ElapsedMilliseconds}ms");
                            return JsonSerializer.Serialize(new ApiResponse
                            {
                                success = injected,
                                message = injected ? "Injection successful!" : "LoadLibraryW failed — check debug.log",
                                steps = steps
                            }, AppJsonContext.Default.ApiResponse);
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
                        
                        try 
                        {
                            File.WriteAllBytes(dllPath, dllBytes);
                        }
                        catch (IOException)
                        {
                            Log($"Mode: OVERWRITE LOCKED");
                            Log($"File {dllPath} is currently locked by a process. Proceeding with the existing file on disk.");
                        }
                    }
                    catch (Exception ex)
                    {
                        Log($"✘ Payload processing failed: {ex.Message}");
                        return JsonSerializer.Serialize(new ApiResponse { success = false, message = "Payload processing failed: " + ex.Message, steps = steps }, AppJsonContext.Default.ApiResponse);
                    }
                }

                // If no bytes were sent from the cloud, the dllPath might not exist on disk.
                // Automatically fall back to the local ClientTest.dll bundled with the backend.
                if (!File.Exists(dllPath))
                {
                    Log($"DLL not found at: {dllPath}");
                    Log("Searching for local fallback DLL...");
                    var searchPaths = new[] {
                        Path.Combine(AppContext.BaseDirectory, "dll", "ClientTest.dll"),
                        Path.Combine(Directory.GetCurrentDirectory(), "dll", "ClientTest.dll"),
                        Path.Combine(Directory.GetCurrentDirectory(), "..", "dll", "ClientTest.dll"),
                        Path.Combine(Directory.GetCurrentDirectory(), "..", "backend", "dll", "ClientTest.dll"),
                        Path.Combine(GetDllFolderPath(), "ClientTest.dll"),
                        Path.Combine(GetDllFolderPath(), "hades.dll")
                    };
                    
                    string? found = null;
                    foreach (var p in searchPaths) {
                        if (File.Exists(p)) { found = Path.GetFullPath(p); break; }
                    }
                    
                    if (found != null) {
                        Log($"Mode: LOCAL FALLBACK");
                        Log($"Found: {found}");
                        dllPath = found;
                    } else {
                        Log("✘ No DLL found anywhere — cannot inject");
                        return JsonSerializer.Serialize(new ApiResponse { success = false, message = "No DLL found! Place ClientTest.dll or hades.dll in the backend/dll/ folder or enable Cloud Sync.", steps = steps }, AppJsonContext.Default.ApiResponse);
                    }
                }

                // Perform deep PE validation and logging
                string debugLogPath = Path.Combine(GetDllFolderPath(), "debug.log");
                try 
                {
                    File.AppendAllText(debugLogPath, $"\n[{DateTime.Now}] Starting injection sequence for PID {processId}\n");
                    var rawDll = File.ReadAllBytes(dllPath);
                    if (rawDll.Length > 0x40)
                    {
                        int peHeaderOffset = BitConverter.ToInt32(rawDll, 0x3C);
                        if (peHeaderOffset > 0 && peHeaderOffset < rawDll.Length - 24)
                        {
                            ushort machine = BitConverter.ToUInt16(rawDll, peHeaderOffset + 4);
                            ushort characteristics = BitConverter.ToUInt16(rawDll, peHeaderOffset + 22);
                            bool is64Bit = (machine == 0x8664);
                            bool isDll = (characteristics & 0x2000) == 0x2000;
                            
                            string diag = $"PE Diagnostics -> 64-bit: {is64Bit} (0x{machine:X}), Valid DLL flag: {isDll} (0x{characteristics:X})\n";
                            File.AppendAllText(debugLogPath, diag);
                            Console.WriteLine($"[INJECT-DIAG] {diag.Trim()}");

                            if (!is64Bit) File.AppendAllText(debugLogPath, "[FATAL] Payload is NOT compiled for 64-bit!\n");
                            if (!isDll) File.AppendAllText(debugLogPath, "[FATAL] Payload is an EXE application, NOT a DLL!\n");
                        }
                    }
                } 
                catch (Exception diagEx) { Console.WriteLine($"[INJECT-DIAG] Failed: {diagEx.Message}"); }

                // Perform injection using LoadLibraryW
                Log($"Target: PID {processId}");
                Log($"DLL path: {dllPath}");
                Log("Calling LoadLibraryW...");
                File.AppendAllText(debugLogPath, $"Executing LoadLibraryW on {dllPath}...\n");

                bool success = false;
                try 
                {
                    success = Injector.InjectDLL(processId, dllPath);
                } 
                catch (Exception injEx) 
                {
                    Log($"✘ LoadLibraryW CRASH: {injEx.Message}");
                    throw;
                }
                
                Log(success ? "✔ LoadLibraryW succeeded — DLL is loaded in target process" : "✘ LoadLibraryW returned false — injection failed");

                File.AppendAllText(debugLogPath, $"Injection result: {success}\n");
                sw.Stop();
                Log($"Total time: {sw.ElapsedMilliseconds}ms");
                return JsonSerializer.Serialize(new ApiResponse
                {
                    success = success,
                    message = success ? "Injection successful!" : "Injection failed",
                    steps = steps
                }, AppJsonContext.Default.ApiResponse);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[INJECT-FATAL] Uncaught Exception: {ex.Message}\n{ex.StackTrace}");
                try { File.AppendAllText(Path.Combine(GetDllFolderPath(), "debug.log"), $"[FATAL CRASH] {ex.Message}\n"); } catch {}
                
                Log($"✘ FATAL: {ex.Message}");
                sw.Stop();
                Log($"Total time: {sw.ElapsedMilliseconds}ms");
                return JsonSerializer.Serialize(new ApiResponse
                {
                    success = false,
                    message = ex.Message,
                    error = ex.Message,
                    steps = steps
                }, AppJsonContext.Default.ApiResponse);
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
                    return JsonSerializer.Serialize(new ApiResponse { success = false, message = "Method not allowed" }, AppJsonContext.Default.ApiResponse);
                }

                using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
                string json = await reader.ReadToEndAsync();
                using var jsonDoc = JsonDocument.Parse(json);
                var data = jsonDoc.RootElement;
                string? filePath = data.TryGetProperty("filePath", out var fp) ? fp.GetString() : null;

                if (string.IsNullOrWhiteSpace(filePath))
                {
                    return JsonSerializer.Serialize(new ApiResponse { success = false, exists = false, message = "filePath is required" }, AppJsonContext.Default.ApiResponse);
                }

                bool exists = File.Exists(filePath) || Directory.Exists(filePath);
                return JsonSerializer.Serialize(new ApiResponse { success = true, exists = exists }, AppJsonContext.Default.ApiResponse);
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new ApiResponse { success = false, exists = false, message = ex.Message }, AppJsonContext.Default.ApiResponse);
            }
        }

        private async Task<string> InjectRemotePayload(HttpListenerRequest request)
        {
            if (request.HttpMethod != "POST")
                return JsonSerializer.Serialize(new ApiResponse { success = false, message = "Method not allowed" }, AppJsonContext.Default.ApiResponse);

            try
            {
                using var reader = new StreamReader(request.InputStream, request.ContentEncoding);
                string json = await reader.ReadToEndAsync();
                using var jsonDoc = JsonDocument.Parse(json);
                var data = jsonDoc.RootElement;

                int processId = data.TryGetProperty("processId", out var pidProp) && pidProp.ValueKind == JsonValueKind.Number
                    ? pidProp.GetInt32()
                    : 0;

                if (processId <= 0)
                    return JsonSerializer.Serialize(new ApiResponse { success = false, message = "processId is required" }, AppJsonContext.Default.ApiResponse);

                string? auth = request.Headers["Authorization"];
                if (string.IsNullOrWhiteSpace(auth) || !auth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                    return JsonSerializer.Serialize(new ApiResponse { success = false, message = "Missing Authorization Bearer token" }, AppJsonContext.Default.ApiResponse);

                string bearerToken = auth.Substring("Bearer ".Length).Trim();

                string? functionsBaseUrl = Environment.GetEnvironmentVariable("SUPABASE_FUNCTIONS_BASE_URL");
                if (string.IsNullOrWhiteSpace(functionsBaseUrl))
                {
                    return JsonSerializer.Serialize(new ApiResponse
                    {
                        success = false,
                        message = "Missing SUPABASE_FUNCTIONS_BASE_URL env var (expected like: https://<project-ref>.supabase.co/functions/v1)"
                    }, AppJsonContext.Default.ApiResponse);
                }

                using var delivery = new PayloadDelivery();
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(60));
                var payload = await delivery.DownloadDecryptToTempFolderAsync(functionsBaseUrl, bearerToken, cts.Token);

                try
                {
                    bool ok = Injector.InjectDLL(processId, payload.ClientDllPath);
                    return JsonSerializer.Serialize(new ApiResponse
                    {
                        success = ok,
                        message = ok ? "Remote payload injection successful!" : "Remote payload injection failed"
                    }, AppJsonContext.Default.ApiResponse);
                }
                finally
                {
                    PayloadDelivery.CleanupTempPayload(payload);
                }
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new ApiResponse { success = false, message = ex.Message }, AppJsonContext.Default.ApiResponse);
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
            return JsonSerializer.Serialize(new StatusResponse
            {
                success = true,
                version = ApiVersion,
#pragma warning disable CA1416
                hasAdminPrivileges = Injector.HasAdminPrivileges(),
#pragma warning restore CA1416
                dllFolder = dllFolder,
                dllFolderExists = dllFolderExists,
                dllCount = dllCount
            }, AppJsonContext.Default.StatusResponse);
        }

        private string GetDlls()
        {
            try
            {
                string dllFolder = GetDllFolderPath();
                if (!Directory.Exists(dllFolder))
                {
                    return JsonSerializer.Serialize(new DllListResponse
                    {
                        success = false,
                        error = "DLL folder not found",
                        dlls = new List<DllInfo>()
                    }, AppJsonContext.Default.DllListResponse);
                }
                var dlls = Directory.GetFiles(dllFolder, "*.dll", SearchOption.TopDirectoryOnly)
                    .Select(f =>
                    {
                        var fi = new FileInfo(f);
                        return new DllInfo { name = fi.Name, path = fi.FullName, size = fi.Length };
                    })
                    .ToList();
                return JsonSerializer.Serialize(new DllListResponse { success = true, dlls = dlls }, AppJsonContext.Default.DllListResponse);
            }
            catch (Exception ex)
            {
                return JsonSerializer.Serialize(new DllListResponse
                {
                    success = false,
                    error = ex.Message,
                    dlls = new List<DllInfo>()
                }, AppJsonContext.Default.DllListResponse);
            }
        }
    }
}