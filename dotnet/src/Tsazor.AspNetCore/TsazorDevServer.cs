using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Tsazor.AspNetCore;

/// <summary>
/// The Vite dev server in Development (D-A4): attached when something answers at its address, else started with
/// <see cref="TsazorDevServerOptions.Command"/> in the client project, and stopped with the app.
/// </summary>
internal sealed partial class TsazorDevServer(
    IOptions<TsazorOptions> options,
    IHostEnvironment environment,
    ILogger<TsazorDevServer> logger) : IHostedService, IDisposable
{
    private readonly TsazorOptions _options = options.Value;
    private readonly HttpClient _probe = new(new SocketsHttpHandler { UseProxy = false, AllowAutoRedirect = false })
    {
        Timeout = TimeSpan.FromSeconds(2),
    };
    private readonly Lock _gate = new();
    private Task? _ready;
    private Process? _process;

    /// <summary>Set by <c>MapTsazor()</c> when Development proxies to the dev server.</summary>
    public bool Mapped { get; set; }

    public Uri Url => _options.DevServer.Url;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        // Build-time OpenAPI generation runs the app's entry point without serving: no dev server for it.
        if (Mapped && Assembly.GetEntryAssembly()?.GetName().Name != "GetDocument.Insider") _ = EnsureStarted();
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        StopProcess();
        return Task.CompletedTask;
    }

    /// <summary>Waits until the dev server answers; false when it doesn't within the startup timeout.</summary>
    public async Task<bool> WaitUntilReadyAsync(CancellationToken cancellationToken)
    {
        try
        {
            await EnsureStarted().WaitAsync(_options.DevServer.StartupTimeout, cancellationToken);
            return true;
        }
        catch (TimeoutException)
        {
            LogTimeout(Url, _options.DevServer.StartupTimeout);
            return false;
        }
        catch (InvalidOperationException exception)
        {
            LogFailed(exception.Message);
            return false;
        }
    }

    private Task EnsureStarted()
    {
        lock (_gate)
        {
            if (_ready is null || _ready.IsFaulted) _ready = StartOrAttachAsync();
            return _ready;
        }
    }

    private async Task StartOrAttachAsync()
    {
        if (await AnswersAsync())
        {
            LogAttached(Url);
            return;
        }
        var command = _options.DevServer.Command;
        if (command is not null && _options.ClientProject is not null && (_process is null || _process.HasExited))
        {
            StartProcess(command.Replace("{port}", Url.Port.ToString(System.Globalization.CultureInfo.InvariantCulture)));
        }
        while (!await AnswersAsync())
        {
            if (_process is { HasExited: true })
            {
                throw new InvalidOperationException($"The dev server ended with exit code {_process.ExitCode} before it answered at {Url}.");
            }
            await Task.Delay(250);
        }
        LogReady(Url);
    }

    private async Task<bool> AnswersAsync()
    {
        try
        {
            using var response = await _probe.GetAsync(Url, HttpCompletionOption.ResponseHeadersRead);
            return true;
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return false;
        }
    }

    private void StartProcess(string command)
    {
        var directory = Path.GetFullPath(Path.Combine(environment.ContentRootPath, _options.ClientProject!));
        if (!Directory.Exists(directory))
        {
            throw new InvalidOperationException($"The client project {directory} does not exist (TsazorOptions.ClientProject).");
        }
        var windows = RuntimeInformation.IsOSPlatform(OSPlatform.Windows);
        var info = new ProcessStartInfo
        {
            FileName = windows ? "cmd.exe" : "/bin/sh",
            WorkingDirectory = directory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        if (windows)
        {
            info.ArgumentList.Add("/d");
            info.ArgumentList.Add("/s");
            info.ArgumentList.Add("/c");
        }
        else
        {
            info.ArgumentList.Add("-c");
        }
        info.ArgumentList.Add(command);
        info.Environment["NO_COLOR"] = "1";
        LogStarting(command, directory);
        try
        {
            _process = Process.Start(info) ?? throw new InvalidOperationException($"Could not start `{command}`.");
        }
        catch (System.ComponentModel.Win32Exception exception)
        {
            throw new InvalidOperationException($"Could not start `{command}` in {directory}: {exception.Message}. Is Node.js installed?", exception);
        }
        _process.OutputDataReceived += (_, line) => { if (line.Data is { Length: > 0 } text) LogOutput(Plain(text)); };
        _process.ErrorDataReceived += (_, line) => { if (line.Data is { Length: > 0 } text) LogError(Plain(text)); };
        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();
    }

    private void StopProcess()
    {
        var process = _process;
        _process = null;
        if (process is null) return;
        try
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException)
        {
            // It ended on its own.
        }
        process.Dispose();
    }

    public void Dispose()
    {
        StopProcess();
        _probe.Dispose();
    }

    private static string Plain(string text) => AnsiEscape().Replace(text, "");

    [GeneratedRegex(@"\x1B\[[0-9;]*[A-Za-z]")]
    private static partial Regex AnsiEscape();

    [LoggerMessage(Level = LogLevel.Information, Message = "Tsazor: the dev server at {Url} is running; requests go there.")]
    private partial void LogAttached(Uri url);

    [LoggerMessage(Level = LogLevel.Information, Message = "Tsazor: the dev server answers at {Url}.")]
    private partial void LogReady(Uri url);

    [LoggerMessage(Level = LogLevel.Information, Message = "Tsazor: starting the dev server: {Command} in {Directory}")]
    private partial void LogStarting(string command, string directory);

    [LoggerMessage(Level = LogLevel.Error, Message = "Tsazor: no dev server answered at {Url} within {Timeout}.")]
    private partial void LogTimeout(Uri url, TimeSpan timeout);

    [LoggerMessage(Level = LogLevel.Error, Message = "Tsazor: {Reason}")]
    private partial void LogFailed(string reason);

    [LoggerMessage(Level = LogLevel.Information, Message = "vite: {Line}")]
    private partial void LogOutput(string line);

    [LoggerMessage(Level = LogLevel.Warning, Message = "vite: {Line}")]
    private partial void LogError(string line);
}
