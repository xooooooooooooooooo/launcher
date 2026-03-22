using Launcher.API;

static int? ParsePort(string? s)
{
    if (string.IsNullOrWhiteSpace(s)) return null;
    return int.TryParse(s.Trim(), out var p) ? p : null;
}

var api = new InjectorAPI();

AppDomain.CurrentDomain.UnhandledException += (s, ev) => 
{
    try {
        string path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".hades", "backend_crash.txt");
        File.WriteAllText(path, ((Exception)ev.ExceptionObject).ToString());
    } catch {}
};

var preferredPort = ParsePort(Environment.GetEnvironmentVariable("INJECTOR_API_PORT"))
                    ?? (args.Length > 0 ? ParsePort(args[0]) : null)
                    ?? 5000;

int port = preferredPort;
Exception? lastError = null;
for (int attempt = 0; attempt < 10; attempt++)
{
    try
    {
        api.Start(port);
        lastError = null;
        break;
    }
    catch (System.Net.HttpListenerException ex) when (ex.ErrorCode == 183)
    {
        lastError = ex;
        port++;
    }
}

if (lastError != null)
    throw lastError;

Console.WriteLine($"Launcher/API version {InjectorAPI.ApiVersion}");

Console.WriteLine($"Injector API Server running on http://localhost:{port}");
Console.WriteLine("Press Ctrl+C to stop the server...");

var shutdown = new System.Threading.ManualResetEventSlim(false);
Console.CancelKeyPress += (sender, e) =>
{
    e.Cancel = true; // keep process alive long enough to stop API cleanly
    shutdown.Set();
};

shutdown.Wait();

api.Stop();
Console.WriteLine("Server stopped.");