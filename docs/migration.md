# Migrating from Blazor

Tsazor's markup is Razor, its component model is Blazor's — so a Blazor app migrates page by
page, not in a big bang. This guide covers running both side by side (E6), then the work per page:
the codemod, what stays manual, the API boundary of a Blazor Server app and what to expect (E7).

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

### What moves across the boundary

- **Authorization** stays on the server: every endpoint checks the user (`RequireAuthorization`,
  policies). `@authorize` and `AuthorizeView` in the Tsazor pages only shape the UI.
- **Validation** runs twice: in the form (Tsazor's validation attributes, for the user) and in the
  endpoint (for the data). Keep the server's rules authoritative; ProblemDetails carry its
  messages back (`problemMessage`).
- **Circuit state.** A Blazor Server app keeps per-user state in scoped services that live as long
  as the circuit. In the browser that state lives in Tsazor services (singletons — one app per
  tab); anything that must survive a reload goes to the server or to storage.
- **Contracts.** Expose the endpoints with OpenAPI (`AddOpenApi()`) and generate the client with
  `@tsazor/dotnet`: DTO changes on the server become compile errors in the pages. Sleipnir
  commands are an alternative for teams that use it ([roadmap-sleipnir.md](roadmap-sleipnir.md)).

## The codemod

`tsazor codemod` (`@tsazor/cli`) turns `.razor` files into `.tsazor` files next to them — nothing is
overwritten:

```sh
npx tsazor codemod src/Pages/Orders          # dry run: a report per file
npx tsazor codemod src/Pages/Orders --write  # writes Orders.tsazor next to Orders.razor
npx tsazor check                             # compiler and type checks over the result
```

The report lists per file the applied fixes and the diagnostic codes that remain — the manual
part. The reference's Diagnostics page (`/reference/diagnostics` in the tutorial app) explains each
code with an example and its fix; the editor (VS Code extension) offers the same fixes as quick
fixes.

| Automatic | Manual |
| --- | --- |
| Razor markup, directives, components, `@bind`, events, `EditForm` — unchanged (it *is* Razor) | C# in `@code` → TypeScript ([csharp-to-typescript.md](csharp-to-typescript.md)) |
| `@foreach (var x in xs)` → `const x of xs` | `(MarkupString)x`, `new { … }`, `out var`, `is null` in markup (TZS024) |
| `$"…{x}…"` → template literal | DataAnnotations `[Required]` → `@Required()` decorators |
| `@attribute [Authorize]` / `[Route]` / `[CascadingTypeParameter]` → `@authorize` / `@page` / `@CascadingTypeParameter("T")` | Third-party component libraries → `@tsazor/fluent`, `@tsazor/bootstrap` or your own |
| `where T : I` → `extends I`, `var` → `let` | JS interop (`IJSRuntime`) → direct DOM/TS calls |
| `.ToString()`, `.Length`, `.ToLower()` in markup | `DynamicComponent` slots (TZS005) |

## What to expect

Measured on a real Blazor code base: the FluentCMS admin and site (217 `.razor` files,
`scripts/probe-razor-corpus.mjs`, markup only — the C# in `@code` blocks is not counted), as of
2026-10-05:

| | Files | Share |
| --- | ---: | ---: |
| Compile cleanly as they are | 157 | 72 % |
| Clean after the codemod's C# forms | 182 | 84 % |
| Remaining real errors (mostly C# casts and expressions in markup, TZS024) | 25 | 12 % |
| Unresolved tags without the components' metadata (named slots; resolve once the components are ported) | 17 | 8 % |

So the markup is largely mechanical. The work of a migration is elsewhere:

1. **The C# in `@code` blocks** becomes TypeScript by hand — the bulk of the effort. It is
   mostly line-by-line (fields, lifecycle methods, event handlers, injected services), with the
   usual C#/TS differences ([csharp-to-typescript.md](csharp-to-typescript.md); the tutorial's
   "TypeScript for C# developers" chapter).
2. **The API boundary** of a Blazor Server app (above) — once per service, shared by all pages
   that use it.
3. **Component libraries** (MudBlazor, Radzen, Fluent UI Blazor): their tags have no Tsazor
   counterpart; map them to `@tsazor/fluent` / `@tsazor/bootstrap` or wrap your own.

Effort per page in hours has not been measured yet; figures from the FluentCMS-admin port will be
added here.

## Per page

1. Draw the API boundary for the services the page uses.
2. Run the codemod on the page and its components; port the `@code` blocks to TypeScript; fix the
   remaining diagnostics (`tsazor check`).
3. Add the route to the gateway's list; mark links to it `target="_top"`.
4. Remove the Blazor page once the Tsazor page is in use.
