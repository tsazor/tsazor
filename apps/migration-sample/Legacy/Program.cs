using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Legacy;
using Legacy.Components;

// The existing Blazor Server app. It keeps serving every page that is not migrated yet;
// the gateway (../Gateway) sends the migrated routes to the Tsazor build instead.

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();

builder.Services.AddSingleton<OrderService>();

// One cookie for both apps: the gateway puts them under one origin, so the browser sends it to
// the Blazor pages and to /api, which the Tsazor pages call.
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "sample.auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Strict;
        // The sample runs on http://localhost; production: CookieSecurePolicy.Always.
        options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        options.LoginPath = "/account/login";
        // Pages redirect to the login; the API answers 401 (the Tsazor pages handle it).
        options.Events.OnRedirectToLogin = context =>
        {
            if (context.Request.Path.StartsWithSegments("/api") || context.Request.Path.StartsWithSegments("/auth"))
                context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            else
                context.Response.Redirect(context.RedirectUri);
            return Task.CompletedTask;
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddCascadingAuthenticationState();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
}

app.UseAuthentication();
app.UseAuthorization();
app.UseAntiforgery();

// --- The API boundary (migration step, see docs/migration.md) ---------------------------
// The Blazor pages call OrderService in-process. The Tsazor pages run in the browser, so the
// same service is exposed as HTTP endpoints — enforced on the server, like every API.
var api = app.MapGroup("/api").RequireAuthorization();
api.MapGet("/orders", (OrderService orders) => orders.GetOrders());
api.MapGet("/orders/{id:int}", (int id, OrderService orders) =>
    orders.GetOrder(id) is { } order ? Results.Ok(order) : Results.NotFound());

// --- Session endpoints (docs/auth.md) ----------------------------------------------------
app.MapGet("/auth/user", (ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true
    ? Results.Ok(new { user = new { name = user.Identity.Name } })
    : Results.Ok(new { user = (object?)null }));

app.MapPost("/auth/logout", async (HttpContext http) =>
{
    await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.Redirect("/");
});

// A demo login (any name, no password). A real app challenges its identity provider here.
app.MapGet("/account/login", (string? returnUrl) => Results.Content($$"""
    <!doctype html>
    <html lang="en"><head><meta charset="utf-8"><title>Sign in</title><link rel="stylesheet" href="/app.css"></head>
    <body><main class="login">
      <h1>Sign in</h1>
      <form method="post" action="/account/login">
        <input type="hidden" name="returnUrl" value="{{System.Net.WebUtility.HtmlEncode(returnUrl ?? "/")}}">
        <label>Name <input name="name" value="alice" autocomplete="username"></label>
        <button type="submit">Sign in</button>
      </form>
    </main></body></html>
    """, "text/html"));

app.MapPost("/account/login", async (HttpContext http) =>
{
    var form = await http.Request.ReadFormAsync();
    var name = form["name"].ToString() is { Length: > 0 } given ? given : "alice";
    var identity = new ClaimsIdentity([new Claim(ClaimTypes.Name, name)], CookieAuthenticationDefaults.AuthenticationScheme);
    await http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
    var returnUrl = form["returnUrl"].ToString();
    // Only local return URLs (no open redirect).
    return Results.Redirect(returnUrl.StartsWith('/') && !returnUrl.StartsWith("//") ? returnUrl : "/");
}).DisableAntiforgery(); // demo form without a token; SameSite=Strict keeps the cookie off cross-site posts

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
