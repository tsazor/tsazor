# Authentication

**The default: the BFF pattern with an HttpOnly cookie.** The ASP.NET Core backend that serves
your API ("backend for frontend") signs the user in and keeps the session in an HttpOnly cookie.
The browser sends the cookie with every request; no script on the page can read it. The Tsazor
app only asks the server who is signed in, to show the right UI.

Two rules hold for every setup:

- **`AuthorizeView` and `@authorize` are UI only.** They decide what the app shows. The app runs
  in the browser, where the user can change any of it. Enforcement happens on the server, on
  every request: an API endpoint checks the user itself.
- **No tokens in browser storage.** `localStorage` and `sessionStorage` are readable by every
  script on the page, so one injected script (XSS) takes the session with it.

## The backend (ASP.NET Core)

A minimal BFF in `Program.cs`. The app is served from the same origin as the API (the ASP.NET
host serves the built files, or a reverse proxy puts both under one host), so the cookie
travels with every `fetch` without any CORS setup.

```csharp
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.HttpOnly = true;                       // scripts never see it
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        options.Cookie.SameSite = SameSiteMode.Strict;        // no cookie on cross-site requests
        // An API answers 401/403 instead of redirecting to a login page.
        options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
    });
    // With an identity provider, add .AddOpenIdConnect("oidc", …) and challenge it in /auth/login.
builder.Services.AddAuthorization();

var app = builder.Build();
app.UseAuthentication();
app.UseAuthorization();

// Who is signed in — the endpoint CookieAuthenticationStateProvider asks (its default: /auth/user).
app.MapGet("/auth/user", (ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true
    ? Results.Ok(new { user = new { name = user.Identity.Name, roles = user.FindAll(ClaimTypes.Role).Select(claim => claim.Value) } })
    : Results.Ok(new { user = (object?)null }));

app.MapGet("/auth/login", (string? returnUrl) =>
    Results.Challenge(new AuthenticationProperties { RedirectUri = returnUrl ?? "/" }, ["oidc"]));

app.MapPost("/auth/logout", async (HttpContext http) =>
{
    await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    return Results.NoContent();
});

// Enforcement: every API endpoint checks the user itself.
app.MapGet("/api/orders", () => /* … */ Results.Ok()).RequireAuthorization();

app.MapFallbackToFile("index.html");
app.Run();
```

`SameSite=Strict` together with same-origin hosting keeps the cookie off requests that other
sites trigger. If your setup needs cross-site requests, add ASP.NET Core's antiforgery tokens.

## The app

`@tsazor/dotnet` brings the provider that asks the endpoint:

```ts
import { AuthenticationStateProvider, createTsazorApp, TsazorHttp } from "@tsazor/runtime";
import { CookieAuthenticationStateProvider } from "@tsazor/dotnet";
import App from "./App.tsazor";

const http = new TsazorHttp();
const auth = new CookieAuthenticationStateProvider(http); // asks /auth/user

createTsazorApp({
    root: App,
    services: (services) => {
        services.registerValue(TsazorHttp, http);
        services.registerValue(AuthenticationStateProvider, auth);
    },
});
```

Any failure (401, a network error) counts as signed out; the provider never throws. Login and
logout are full page navigations — `navigation.navigateTo("/auth/login", true)`, and after the
logout request `navigateTo("/", true)` — so the app starts again with the new state.
`AuthorizeView`, `AuthorizeRouteView`, `@authorize` and `CascadingAuthenticationState` then
work as in the tutorial's auth chapter.

## JWT in the browser — only with a stated reason

Holding an access token in the app is sometimes necessary, for example to call a third-party API
directly from the browser. Then:

- keep the token **in memory** only (a variable or a service), never in `localStorage` or
  `sessionStorage`; prefer short-lived tokens;
- `JwtAuthenticationStateProvider` decodes the token's claims for the UI and **does not verify
  its signature** — the server validates every token it receives (`AddJwtBearer`);
- `attachJwtAuth(http, provider)` adds the `Authorization: Bearer …` header to every request, and
  logs out when the server answers that token with a 401 (expired, revoked): on a page that needs a
  signed-in user, `AuthorizeView` and `AuthorizeRouteView` then show `NotAuthorized` (the app's
  redirect to the login). Blazor leaves this to a
  `DelegatingHandler` of the app's own (Tsazor extension). A 401 to an older token, after a new
  login, changes nothing; a 403 never logs out.

Write down why the BFF pattern doesn't fit before you choose this.
