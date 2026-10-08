using System.Security.Claims;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.FileProviders;
using Yarp.ReverseProxy.Configuration;
using Yarp.ReverseProxy.Transforms;

// The BFF between the Tsazor app and FluentCMS's API (the pattern of docs/auth.md).
//
// FluentCMS wants two credentials on every API call: the app's API token (X-API-AUTH) and the
// user's JWT. Its Blazor Server UI keeps both on the server. An SPA cannot keep a secret, so this
// host keeps them, and the browser only ever holds an HttpOnly session cookie:
//
// - POST /api/Account/Authenticate signs in: the JWT goes into the session cookie, and the app
//   gets the user without the token.
// - /api/** is proxied to FluentCMS with the API token, and with the user's JWT as Bearer.
// - GET /bff/user says who is signed in (CookieAuthenticationStateProvider); POST /bff/logout signs out.
// - /files/** are FluentCMS's files (uploads, the template's images).
// - Everything else is the built app (dist/), with index.html for the app's routes.

var builder = WebApplication.CreateBuilder(args);

// scripts/backend.mjs writes FluentCMS's URL and the API token from its setup here.
builder.Configuration.AddJsonFile(
    Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, "..", ".backend", "fluentcms.json")),
    optional: true,
    reloadOnChange: true);
var apiUrl = builder.Configuration["FluentCms:ApiUrl"] ?? "http://localhost:5340/";
string ApiKey(HttpContext http) => http.RequestServices.GetRequiredService<IConfiguration>()["FluentCms:ApiKey"]
    ?? throw new InvalidOperationException("No FluentCMS API token: run `pnpm --filter fluentcms backend` first.");

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "fluentcms.session";
        options.Cookie.HttpOnly = true;                        // scripts never see it
        options.Cookie.SameSite = SameSiteMode.Strict;         // no cookie on cross-site requests
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest; // http on localhost
        options.ExpireTimeSpan = TimeSpan.FromDays(10);        // FluentCMS's own cookie lasts 10 days
        options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();
builder.Services.AddHttpClient("fluentcms", client => client.BaseAddress = new Uri(apiUrl));

builder.Services.AddReverseProxy()
    .LoadFromMemory(
        [
            new RouteConfig { RouteId = "api", ClusterId = "fluentcms", Match = new RouteMatch { Path = "/api/{**rest}" } },
            new RouteConfig { RouteId = "files", ClusterId = "fluentcms", Match = new RouteMatch { Path = "/files/{**rest}" } },
        ],
        [
            new ClusterConfig
            {
                ClusterId = "fluentcms",
                Destinations = new Dictionary<string, DestinationConfig> { ["backend"] = new() { Address = apiUrl } },
            },
        ])
    .AddTransforms(context => context
        // FluentCMS finds the site by the request's host (its files too): keep the browser's host.
        .AddOriginalHost(true)
        .AddRequestTransform(transform =>
    {
        var headers = transform.ProxyRequest.Headers;
        // The credentials come from here, never from the browser.
        headers.Remove("X-API-AUTH");
        headers.Remove("Authorization");
        headers.Remove("Cookie");
        headers.TryAddWithoutValidation("X-API-AUTH", ApiKey(transform.HttpContext));
        if (transform.HttpContext.User.FindFirst("jwt")?.Value is { } jwt)
            headers.TryAddWithoutValidation("Authorization", $"Bearer {jwt}");
        return ValueTask.CompletedTask;
    }));

var app = builder.Build();

// The built app (`pnpm --filter fluentcms build`); read per request, so a build after the start counts.
var dist = Directory.CreateDirectory(Path.Combine(builder.Environment.ContentRootPath, "..", "dist")).FullName;
var distFiles = new PhysicalFileProvider(dist);
app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = distFiles });
app.UseStaticFiles(new StaticFileOptions { FileProvider = distFiles });
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

// Sign-in: FluentCMS checks the password and issues the JWT; the JWT stays in the session cookie.
app.MapPost("/api/Account/Authenticate", async (HttpContext http, IHttpClientFactory clients) =>
{
    using var reader = new StreamReader(http.Request.Body);
    var requestBody = await reader.ReadToEndAsync();
    using var request = new HttpRequestMessage(HttpMethod.Post, "api/Account/Authenticate")
    {
        Content = new StringContent(requestBody, Encoding.UTF8, "application/json"),
    };
    request.Headers.Add("X-API-AUTH", ApiKey(http));
    using var response = await clients.CreateClient("fluentcms").SendAsync(request);
    var envelope = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;

    if (response.IsSuccessStatusCode && envelope?["data"] is JsonObject user && user["token"]?.GetValue<string>() is { } jwt)
    {
        var identity = new ClaimsIdentity(
            [
                new Claim(ClaimTypes.NameIdentifier, user["userId"]?.GetValue<string>() ?? ""),
                new Claim(ClaimTypes.Name, user["userName"]?.GetValue<string>() ?? ""),
                new Claim(ClaimTypes.Email, user["email"]?.GetValue<string>() ?? ""),
                new Claim("jwt", jwt),
            ],
            CookieAuthenticationDefaults.AuthenticationScheme);
        await http.SignInAsync(new ClaimsPrincipal(identity), new AuthenticationProperties { IsPersistent = true });
        user["token"] = null;
    }
    return Results.Content(envelope?.ToJsonString() ?? "", "application/json", Encoding.UTF8, (int)response.StatusCode);
});

// Who is signed in: the session endpoint CookieAuthenticationStateProvider asks.
app.MapGet("/bff/user", (ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true
    ? Results.Ok(new
    {
        user = new
        {
            name = user.Identity.Name,
            claims = new Dictionary<string, string>
            {
                ["sub"] = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
                ["email"] = user.FindFirstValue(ClaimTypes.Email) ?? "",
            },
        },
    })
    : Results.Ok(new { user = (object?)null }));

app.MapPost("/bff/logout", async (HttpContext http) =>
{
    await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
});

app.MapReverseProxy();

// The app's own routes (FluentCMS pages are URLs like /admin/roles): its index.html.
app.MapFallbackToFile("index.html", new StaticFileOptions { FileProvider = distFiles });

app.Run();
