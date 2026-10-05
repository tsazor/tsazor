# Migrating from Blazor

Tsazor's markup is Razor, its component model is Blazor's — so a Blazor app migrates page by
page, not in a big bang. This guide covers running both side by side (E6). The codemod workflow,
the Blazor Server API boundary in detail and effort figures follow in the migration guide part
(E7).

The reference setup is [apps/migration-sample](../apps/migration-sample/README.md): a Blazor Server
app, a YARP gateway and Tsazor pages, checked end to end in CI.

## Side by side, route by route

```text
browser ──► gateway (YARP, one origin)
              ├─ migrated routes        → the Tsazor build (static files)
              └─ everything else        → the Blazor app (pages, /_blazor, /api, /auth)
```

- **One origin.** The browser only talks to the gateway. Cookies, `fetch` calls and links need no
  CORS and no second login.
- **The gateway decides per route.** A list of migrated routes (`Tsazor:Routes` in the sample)
  gets the Tsazor app's `index.html`; its router takes over from there. Everything else is proxied
  to the Blazor app, including its WebSocket (Blazor Server's circuit). Switching a route back is a
  configuration change — the old Blazor page can stay until the new one has proven itself.
- **Assets under their own prefix.** Build the Tsazor app with `base: "/tsazor/"` (Vite), so its
  scripts never collide with the Blazor app's paths; the gateway serves that folder.
- **Static files before routing** in the gateway: the proxy's catch-all route would otherwise be
  chosen first, and ASP.NET's static file middleware skips requests that already have an endpoint
  (`app.UseStaticFiles(…); app.UseRouting();`).

## One sign-in

The Blazor app keeps issuing the cookie (its login, its identity provider). Because both parts are
behind one origin, the browser sends that cookie to the Tsazor pages' API calls too:

- The Blazor app adds the session endpoint `/auth/user`; the Tsazor app registers
  `CookieAuthenticationStateProvider` (`@tsazor/dotnet`), and `AuthorizeView`, `@authorize` and
  `AuthorizeRouteView` work on the same user.
- API endpoints answer **401** instead of redirecting to the login page
  (`OnRedirectToLogin`: a redirect for page requests, a status code for `/api` and `/auth`).
- Login and logout stay where they are; the Tsazor pages leave for them with a full page load and
  come back via `returnUrl`.
- Details and the cookie settings: [auth.md](auth.md).

## Links between the parts

Both routers intercept same-origin links. A link to a page the *other* part serves must be a full
page load, so the gateway can route it:

- `target="_top"` on such links — neither Blazor nor Tsazor intercepts a link with a target other
  than `_self`. Put it into the shared navigation of both layouts.
- As a safety net, the Tsazor app's `NotFound` hands an unknown URL back to the gateway with a
  forced load, once (a session marker stops a loop when the gateway routes it back) — see
  `LeaveApp.tsazor` in the sample.
- Give both layouts the same header and stylesheet (the sample's Tsazor pages load the Blazor app's
  `app.css` through the gateway) and users do not notice the boundary.

## The API boundary

A Blazor **Server** app calls its services in-process — there is no API the browser could use.
Before the first page moves, draw that boundary for it: endpoints over the same services, enforced
on the server (`RequireAuthorization`). The Blazor pages keep calling the services directly; only
the migrated pages use the endpoints. In the sample:

```csharp
var api = app.MapGroup("/api").RequireAuthorization();
api.MapGet("/orders", (OrderService orders) => orders.GetOrders());
api.MapGet("/orders/{id:int}", (int id, OrderService orders) =>
    orders.GetOrder(id) is { } order ? Results.Ok(order) : Results.NotFound());
```

With an OpenAPI document (`AddOpenApi()`), `@tsazor/dotnet` generates the typed client for these
endpoints; the sample writes its small client by hand. Blazor **WebAssembly** apps usually have the
API already — they skip this step.

## Per page

1. Draw the API boundary for the services the page uses.
2. Build the page in Tsazor — the codemod (`tsazor codemod`) converts the markup and the mechanical
   C# forms; the `@code` block becomes TypeScript by hand.
3. Add the route to the gateway's list; mark links to it `target="_top"`.
4. Remove the Blazor page once the Tsazor page is in use.
