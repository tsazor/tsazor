# Blazor and Tsazor on one backend

Not every team migrates. A common setup: a **Blazor app that stays** — an admin or back office,
Blazor Server or WebAssembly — and a **public frontend** next to it, written in Svelte, React or
Vue only because Blazor did not fit there (bundle size, startup time, a team that also does web).
Tsazor replaces that second stack: the public frontend speaks the admin's vocabulary, uses the same
contract and the same sign-in, and the .NET team can work on both.

This guide covers what the two apps share. Moving pages *from* Blazor *to* Tsazor is
[migration.md](migration.md).

## Topology

```text
admin.example.com ──► Blazor app (Server or WASM)  ─┐
                                                     ├─► ASP.NET API (one contract, one database)
www.example.com   ──► Tsazor app (static files)    ─┘
```

The Tsazor app is static files: serve them from the API host (`MapFallbackToFile`), a CDN, or the
same reverse proxy. Same origin is simplest (no CORS, the cookie just works, see
[auth.md](auth.md)); subdomains of one site work too (below).

Tsazor is a client-side app today. If the public frontend needs server rendering for SEO, plan
with static prerendering or wait for SSR ([after 1.0](after-1.0.md#server-side-rendering)).

## One contract

The API is defined once, in C#. Both apps consume it:

- The **Blazor Server** admin calls the services in-process (or the API, if it is WASM).
- The **Tsazor** app uses a client generated from the API's OpenAPI document by `@tsazor/dotnet`:
  DTOs become TypeScript types, `[Required]`/`[StringLength]`/`[Range]`/`[RegularExpression]`
  become the same validation decorators on the form models (`@Required()`, `@StringLength(…)`),
  and responses come back as `HttpResult` with ProblemDetails.

Regenerate the client in CI from the built API and fail on a diff: a breaking DTO change then
fails the build of the public frontend instead of its users.

## One sign-in (when the audiences overlap)

Often they do not: staff sign in to the admin, customers to the public site — then each app has
its own cookie and scheme, and nothing is shared. When the same users use both:

- **Same origin** (one host, paths per app): one cookie, nothing to configure.
- **Subdomains of one site** (`admin.example.com`, `www.example.com`): set the cookie domain to
  the parent (`options.Cookie.Domain = ".example.com"`). If the two apps issue or read the cookie
  in different processes, give them one ASP.NET Data Protection key ring and application name
  (`AddDataProtection().PersistKeysTo…().SetApplicationName("example")`) so each can decrypt the
  other's cookie. `SameSite=Strict` still works: subdomains of one registrable domain are the same
  *site*.
- The Tsazor app asks `/auth/user` (`CookieAuthenticationStateProvider`); login and logout stay
  with whichever app owns them. Details: [auth.md](auth.md).

## One look

Share design tokens as CSS custom properties, not component code:

- With **Fluent UI Blazor** in the admin, `@tsazor/fluent` gives the public app the same Fluent 2
  design language; map brand colors to the tokens both read (`--fui-*` in Tsazor, the Fluent
  design tokens in Blazor) in one `tokens.css`.
- With **Bootstrap** in the admin, `@tsazor/bootstrap` renders Bootstrap 5 markup: one theme file
  for both.
- Serve the shared stylesheet from one place (the API host or a shared static folder), so a brand
  change lands in both apps at once.

## One vocabulary

The reason to pick Tsazor over a third stack: what the team knows from Blazor carries over almost
literally.

| Blazor | Tsazor |
| --- | --- |
| `.razor` components, `@code`, `[Parameter]` | `.tsazor` components, `@code`, `@Parameter()` |
| `EventCallback`, `@bind`, `@bind-Value`, `@ref`, `@key` | the same |
| `CascadingValue`, `RenderFragment`, templated components | the same |
| `@inject`, `builder.Services.Add…` | `@inject`, `services.register…` in `Program.ts` |
| `EditForm`, DataAnnotations, `ValidationMessage` | `EditForm`, validation decorators, `ValidationMessage` |
| `AuthorizeView`, `@attribute [Authorize]`, `AuthenticationStateProvider` | `AuthorizeView`, `@authorize`, `AuthenticationStateProvider` |
| `NavigationManager`, `@page`, `NavLink` | the same |
| bUnit | `@tsazor/testing` |

A developer who reviews a pull request in the admin can review one in the public frontend; the
architecture of both follows [patterns.md](patterns.md). What differs is the language in `@code` —
TypeScript instead of C# ([csharp-to-typescript.md](csharp-to-typescript.md)) — and the fact that
the public app runs in the browser: every call goes through the API, and the API enforces access.

## Checklist

1. The API publishes OpenAPI; CI generates the Tsazor client and fails on drift.
2. Decide whether the audiences share a sign-in; if yes, same origin or a parent cookie domain plus
   one Data Protection key ring.
3. One `tokens.css` (or theme) for both apps.
4. The public app follows [patterns.md](patterns.md); its tests use `@tsazor/testing`.
