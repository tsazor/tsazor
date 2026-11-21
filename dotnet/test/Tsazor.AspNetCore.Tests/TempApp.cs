using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;

namespace Tsazor.AspNetCore.Tests;

/// <summary>A content root in a temp directory: a built app in wwwroot, a secret next to it.</summary>
internal sealed class TempApp : IAsyncDisposable
{
    public const string IndexHtml = "<!doctype html><title>app</title><script type=\"module\" src=\"/assets/index-AAAA.js\"></script>";

    public string Root { get; } = Directory.CreateTempSubdirectory("tsazor-aspnetcore-").FullName;

    public string WebRoot => Path.Combine(Root, "wwwroot");

    private WebApplication? _app;

    public TempApp(bool built = true)
    {
        File.WriteAllText(Path.Combine(Root, "secret.txt"), "secret");
        if (!built) return;
        Write("wwwroot/index.html", IndexHtml);
        Write("wwwroot/assets/index-AAAA.js", "console.log('a');");
        Write("wwwroot/favicon.svg", "<svg/>");
        Write("wwwroot/.env", "SECRET=1");
    }

    public void Write(string relative, string content)
    {
        var path = Path.Combine(Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, content);
    }

    /// <summary>Starts the app on a TestServer; <paramref name="map"/> adds the app's own endpoints first.</summary>
    public async Task<TestServer> StartAsync(
        Action<TsazorOptions>? configure = null,
        Action<WebApplication>? map = null,
        string environment = "Production")
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ContentRootPath = Root,
            EnvironmentName = environment,
            WebRootPath = WebRoot,
        });
        builder.WebHost.UseTestServer();
        builder.Services.AddTsazor(configure);
        _app = builder.Build();
        map?.Invoke(_app);
        _app.MapTsazor();
        await _app.StartAsync();
        return _app.GetTestServer();
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is not null) await _app.DisposeAsync();
        try
        {
            Directory.Delete(Root, recursive: true);
        }
        catch (IOException)
        {
            // A file still open on Windows: the temp directory is cleaned up later.
        }
    }
}
