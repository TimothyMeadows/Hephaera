using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

internal static class Program
{
    private static async Task<int> Main(string[] args)
    {
        Process? child = null;
        var cancellationExit = 0;
        void Cancel(int code)
        {
            Interlocked.CompareExchange(ref cancellationExit, code, 0);
            try { if (child is { HasExited: false }) child.Kill(entireProcessTree: true); }
            catch (InvalidOperationException) { }
            catch (System.ComponentModel.Win32Exception) { }
        }
        ConsoleCancelEventHandler cancelHandler = (_, e) => { e.Cancel = true; Cancel(130); };
        EventHandler exitHandler = (_, _) => Cancel(143);
        Console.CancelKeyPress += cancelHandler;
        AppDomain.CurrentDomain.ProcessExit += exitHandler;
        using var termination = OperatingSystem.IsWindows() ? null : PosixSignalRegistration.Create(PosixSignal.SIGTERM, context => { context.Cancel = true; Cancel(143); });
        try
        {
            var core = Path.Combine(AppContext.BaseDirectory, "embedded", "core");
            var manifestPath = Path.Combine(core, "release-manifest.json");
            var metadata = Assembly.GetExecutingAssembly().GetCustomAttributes<AssemblyMetadataAttribute>().ToDictionary(x => x.Key, x => x.Value);
            var expectedHash = metadata.GetValueOrDefault("HephaeraManifestSha256");
            var bytes = File.ReadAllBytes(manifestPath);
            var actualHash = Convert.ToHexStringLower(SHA256.HashData(bytes));
            using var manifest = JsonDocument.Parse(bytes);
            if (string.IsNullOrEmpty(expectedHash) || actualHash != expectedHash || manifest.RootElement.GetProperty("version").GetString() != metadata.GetValueOrDefault("HephaeraPackageVersion"))
                throw new InvalidDataException("The bundled release manifest does not match this tool package. Restore the exact reviewed package version.");
            var start = new ProcessStartInfo("node") { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = true };
            start.ArgumentList.Add(Path.Combine(core, "cli.cjs"));
            foreach (var argument in args) start.ArgumentList.Add(argument);
            start.Environment["HEPHAERA_INSTALLER_CHANNEL"] = "nuget";
            child = Process.Start(start) ?? throw new InvalidOperationException("Node did not start.");
            using var inputLifetime = new CancellationTokenSource();
            var output = child.StandardOutput.BaseStream.CopyToAsync(Console.OpenStandardOutput());
            var errors = child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
            async Task ForwardInput()
            {
                try { await Console.OpenStandardInput().CopyToAsync(child.StandardInput.BaseStream, inputLifetime.Token); child.StandardInput.Close(); }
                catch (Exception error) when (error is OperationCanceledException or IOException or ObjectDisposedException) { }
            }
            _ = ForwardInput();
            if (Volatile.Read(ref cancellationExit) != 0) Cancel(cancellationExit);
            await child.WaitForExitAsync();
            inputLifetime.Cancel();
            await Task.WhenAll(output, errors);
            return cancellationExit == 0 ? child.ExitCode : cancellationExit;
        }
        catch (Exception error) when (error is IOException or InvalidDataException or JsonException or InvalidOperationException or System.ComponentModel.Win32Exception)
        {
            Console.Error.WriteLine("Hephaera launcher: " + error.Message);
            return cancellationExit == 0 ? 69 : cancellationExit;
        }
        finally
        {
            Console.CancelKeyPress -= cancelHandler;
            AppDomain.CurrentDomain.ProcessExit -= exitHandler;
            child?.Dispose();
        }
    }
}
