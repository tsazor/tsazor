using System.Net;
using System.Net.WebSockets;
using System.Text;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace Tsazor.AspNetCore.Tests;

/// <summary>Development: the requests no endpoint takes go to the dev server — plain, streamed and as WebSocket.</summary>
public sealed class DevServerTests : IAsyncLifetime
{
    private readonly TaskCompletionSource _release = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private WebApplication _vite = null!;
    private WebApplication _app = null!;
    private TempApp _content = null!;
    private Uri _base = null!;

    /// <summary>A stand-in for Vite on a free port.</summary>
    private async Task<Uri> StartFakeViteAsync()
    {
        var builder = WebApplication.CreateSlimBuilder();
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        _vite = builder.Build();
        _vite.UseWebSockets();
        _vite.Use(async (context, next) =>
        {
            if (!context.WebSockets.IsWebSocketRequest)
            {
                await next(context);
                return;
            }
            using var socket = await context.WebSockets.AcceptWebSocketAsync("vite-hmr");
            var buffer = new byte[1024];
            var received = await socket.ReceiveAsync(buffer, CancellationToken.None);
            await socket.SendAsync(Encoding.UTF8.GetBytes("echo:" + Encoding.UTF8.GetString(buffer, 0, received.Count)), WebSocketMessageType.Text, true, CancellationToken.None);
            await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None);
        });
        _vite.MapGet("/src/main.ts", () => Results.Text("export {};", "text/javascript"));
        _vite.MapGet("/runs/42", (HttpContext context) => Results.Text($"vite html for {context.Request.Path}", "text/html"));
        _vite.MapGet("/events", async (HttpContext context) =>
        {
            context.Response.ContentType = "text/event-stream";
            await context.Response.WriteAsync("data: one\n\n");
            await context.Response.Body.FlushAsync();
            await _release.Task;
            await context.Response.WriteAsync("data: two\n\n");
        });
        await _vite.StartAsync();
        return new Uri(Address(_vite));
    }

    private static string Address(WebApplication app) =>
        app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();

    private async Task StartAppAsync(Action<TsazorOptions> configure)
    {
        _content = new TempApp();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = _content.Root, EnvironmentName = "Development" });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        builder.Services.AddTsazor(o =>
        {
            o.ClientProject = ".";
            o.DevServer.Command = null; // attach only: the stand-in is already running
            configure(o);
        });
        _app = builder.Build();
        _app.MapGet("/api/hello", () => "hello");
        _app.MapTsazor();
        await _app.StartAsync();
        _base = new Uri(Address(_app));
    }

    public async Task InitializeAsync()
    {
        var vite = await StartFakeViteAsync();
        await StartAppAsync(o => o.DevServer.Url = vite);
    }

    public async Task DisposeAsync()
    {
        _release.TrySetResult();
        await _app.DisposeAsync();
        await _vite.DisposeAsync();
        await _content.DisposeAsync();
    }

    private HttpClient Client() => new() { BaseAddress = _base, Timeout = TimeSpan.FromSeconds(20) };

    [Fact]
    public async Task A_module_and_a_route_come_from_the_dev_server()
    {
        using var client = Client();

        Assert.Equal("export {};", await client.GetStringAsync("/src/main.ts"));
        Assert.Equal("vite html for /runs/42", await client.GetStringAsync("/runs/42"));
    }

    [Fact]
    public async Task The_apps_endpoints_and_api_prefixes_stay_with_the_app()
    {
        using var client = Client();

        Assert.Equal("hello", await client.GetStringAsync("/api/hello"));
        using var missing = await client.GetAsync("/api/missing");
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }

    [Fact]
    public async Task Server_sent_events_are_not_buffered()
    {
        using var client = Client();
        using var response = await client.GetAsync("/events", HttpCompletionOption.ResponseHeadersRead);
        await using var stream = await response.Content.ReadAsStreamAsync();
        using var reader = new StreamReader(stream);

        // The first event arrives while the dev server still holds the stream open.
        var first = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(10));
        Assert.Equal("data: one", first);
        _release.SetResult();
        await reader.ReadLineAsync();
        Assert.Equal("data: two", await reader.ReadLineAsync());
    }

    [Fact]
    public async Task The_hmr_websocket_goes_through()
    {
        using var socket = new ClientWebSocket();
        socket.Options.AddSubProtocol("vite-hmr");
        var uri = new UriBuilder(_base) { Scheme = "ws", Path = "/", Query = "token=abc" }.Uri;
        await socket.ConnectAsync(uri, CancellationToken.None);

        Assert.Equal("vite-hmr", socket.SubProtocol);
        await socket.SendAsync(Encoding.UTF8.GetBytes("ping"), WebSocketMessageType.Text, true, CancellationToken.None);
        var buffer = new byte[1024];
        var received = await socket.ReceiveAsync(buffer, CancellationToken.None);
        Assert.Equal("echo:ping", Encoding.UTF8.GetString(buffer, 0, received.Count));
    }
}

/// <summary>No dev server and nothing to start it with: a 502 that says so, after the timeout.</summary>
public sealed class DevServerDownTests
{
    [Fact]
    public async Task A_dev_server_that_never_answers_is_a_502()
    {
        await using var content = new TempApp();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { ContentRootPath = content.Root, EnvironmentName = "Development" });
        builder.WebHost.UseUrls("http://127.0.0.1:0");
        builder.Logging.ClearProviders();
        builder.Services.AddTsazor(o =>
        {
            o.ClientProject = ".";
            o.DevServer.Command = null;
            o.DevServer.Url = new Uri("http://127.0.0.1:1");
            o.DevServer.StartupTimeout = TimeSpan.FromSeconds(1);
        });
        await using var app = builder.Build();
        app.MapTsazor();
        await app.StartAsync();
        using var client = new HttpClient { BaseAddress = new Uri(app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First()) };

        using var response = await client.GetAsync("/runs/42");

        Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        Assert.Contains("did not start", await response.Content.ReadAsStringAsync());
    }
}
