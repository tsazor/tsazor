using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;

namespace Tsazor.AspNetCore.Tests;

/// <summary>The production rules of MapTsazor(): fallback, 404s, caching, files from disk, traversal.</summary>
public sealed class HostingTests
{
    private static async Task<HttpResponseMessage> Get(TestServer server, string path, string method = "GET")
    {
        using var client = server.CreateClient();
        return await client.SendAsync(new HttpRequestMessage(new HttpMethod(method), path));
    }

    /// <summary>A request with a raw path, as no client would normalize it.</summary>
    private static Task<HttpContext> Raw(TestServer server, string path) =>
        server.SendAsync(context =>
        {
            context.Request.Method = "GET";
            context.Request.Path = path;
        });

    [Theory]
    [InlineData("/")]
    [InlineData("/runs/42")]
    [InlineData("/runs/42/details")]
    [InlineData("/apiary")]
    public async Task An_extensionless_route_gets_index_html_without_caching(string path)
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();

        using var response = await Get(server, path);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("no-cache", response.Headers.CacheControl?.ToString());
        Assert.Equal(TempApp.IndexHtml, await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Index_html_itself_is_not_cached()
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();

        using var response = await Get(server, "/index.html");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-cache", response.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task A_hashed_asset_is_cached_for_a_year()
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();

        using var response = await Get(server, "/assets/index-AAAA.js");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/javascript", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("public, max-age=31536000, immutable", response.Headers.CacheControl?.ToString());
    }

    [Fact]
    public async Task A_file_outside_the_assets_is_revalidated()
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();

        using var response = await Get(server, "/favicon.svg");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-cache", response.Headers.CacheControl?.ToString());
    }

    [Theory]
    [InlineData("/assets/index-BBBB.js")]
    [InlineData("/assets/missing.css")]
    [InlineData("/logo.png")]
    [InlineData("/runs/42/data.json")]
    public async Task A_missing_file_is_a_404_not_index_html(string path)
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();

        using var response = await Get(server, path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.NotEqual(TempApp.IndexHtml, await response.Content.ReadAsStringAsync());
    }

    [Theory]
    [InlineData("/api")]
    [InlineData("/api/missing")]
    [InlineData("/API/Missing/1")]
    [InlineData("/internal/x")]
    public async Task A_missing_endpoint_below_an_api_prefix_is_a_404(string path)
    {
        await using var app = new TempApp();
        var server = await app.StartAsync(o => o.ApiPrefixes.Add("/internal"));

        using var response = await Get(server, path);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task The_apps_endpoints_win_over_the_fallback()
    {
        await using var app = new TempApp();
        var server = await app.StartAsync(map: web =>
        {
            web.MapGet("/api/hello", () => "hello");
            web.MapGet("/health", () => "ok");
        });

        using var api = await Get(server, "/api/hello");
        using var health = await Get(server, "/health");

        Assert.Equal("hello", await api.Content.ReadAsStringAsync());
        Assert.Equal("ok", await health.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Only_get_and_head_fall_back()
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();

        using var post = await Get(server, "/runs/42", "POST");
        using var head = await Get(server, "/runs/42", "HEAD");

        Assert.Equal(HttpStatusCode.NotFound, post.StatusCode);
        Assert.Equal(HttpStatusCode.OK, head.StatusCode);
        Assert.Equal("", await head.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task A_rebuild_is_served_without_a_restart()
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();
        using (var before = await Get(server, "/assets/index-AAAA.js")) Assert.Equal(HttpStatusCode.OK, before.StatusCode);

        // The new build: other hashes, a new index.html.
        const string rebuilt = "<!doctype html><script type=\"module\" src=\"/assets/index-BBBB.js\"></script>";
        File.Delete(Path.Combine(app.WebRoot, "assets", "index-AAAA.js"));
        app.Write("wwwroot/assets/index-BBBB.js", "console.log('b');");
        app.Write("wwwroot/index.html", rebuilt);

        using var page = await Get(server, "/runs/42");
        using var asset = await Get(server, "/assets/index-BBBB.js");
        using var old = await Get(server, "/assets/index-AAAA.js");

        Assert.Equal(rebuilt, await page.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.OK, asset.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, old.StatusCode);
    }

    [Fact]
    public async Task A_build_that_appears_after_the_start_is_served()
    {
        await using var app = new TempApp(built: false);
        var server = await app.StartAsync();
        using (var before = await Get(server, "/runs/42")) Assert.Equal(HttpStatusCode.NotFound, before.StatusCode);

        app.Write("wwwroot/index.html", TempApp.IndexHtml);
        app.Write("wwwroot/assets/index-AAAA.js", "console.log('a');");

        using var page = await Get(server, "/runs/42");
        using var asset = await Get(server, "/assets/index-AAAA.js");
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        Assert.Equal(HttpStatusCode.OK, asset.StatusCode);
    }

    [Theory]
    [InlineData("/../secret.txt")]
    [InlineData("/assets/../../secret.txt")]
    [InlineData("/assets/..\\..\\secret.txt")]
    [InlineData("/..%2fsecret.txt")]
    [InlineData("/.env")]
    public async Task No_path_reaches_above_the_root_or_a_dot_file(string path)
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();

        var context = await Raw(server, path);

        Assert.Equal(StatusCodes.Status404NotFound, context.Response.StatusCode);
    }

    [Theory]
    [InlineData("/..%2f..%2fsecret.txt")]
    [InlineData("/%2e%2e/%2e%2e/secret.txt")]
    [InlineData("/assets/%2e%2e%5c%2e%2e%5csecret.txt")]
    public async Task No_encoded_path_reaches_above_the_root(string path)
    {
        await using var app = new TempApp();
        var server = await app.StartAsync();

        using var response = await Get(server, path);

        Assert.NotEqual("secret", await response.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task A_file_root_serves_its_files_and_nothing_above_it()
    {
        await using var app = new TempApp();
        app.Write("uploads/report.txt", "report");
        var server = await app.StartAsync(o => o.AddFileRoot("/files", "uploads"));

        using var file = await Get(server, "/files/report.txt");
        var above = await Raw(server, "/files/../secret.txt");
        var aboveBackslash = await Raw(server, "/files/..\\secret.txt");

        Assert.Equal("report", await file.Content.ReadAsStringAsync());
        Assert.Equal("no-cache", file.Headers.CacheControl?.ToString());
        Assert.Equal(StatusCodes.Status404NotFound, above.Response.StatusCode);
        Assert.Equal(StatusCodes.Status404NotFound, aboveBackslash.Response.StatusCode);
    }

    [Fact]
    public async Task Development_without_a_client_project_serves_the_build()
    {
        await using var app = new TempApp();
        var server = await app.StartAsync(environment: "Development");

        using var page = await Get(server, "/runs/42");
        using var missing = await Get(server, "/assets/missing.js");

        Assert.Equal(TempApp.IndexHtml, await page.Content.ReadAsStringAsync());
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
    }
}
