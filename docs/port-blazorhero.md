# Port: BlazorHero → Tsazor

The second app port before 1.0 (owner, 2026-10-12), after [FluentCMS](port-fluentcms.md). Where FluentCMS was a
Blazor Server admin behind a cookie BFF, BlazorHero is the typical Blazor WebAssembly app of a .NET team from
2021–2023: [fullstackhero/blazor-starter-kit](https://github.com/fullstackhero/blazor-starter-kit) (MIT), hosted
WebAssembly on MudBlazor 6, Identity with JWT and refresh tokens in the browser, SignalR (chat, notifications),
localization (resx, eleven languages, Arabic right-to-left), a dashboard with charts, server-paged tables with Excel
export and import.

The rule is FluentCMS's: the backend stays unchanged, every gap becomes a framework fix with a test, every lesson
goes into [migration-practices.md](migration-practices.md). A week of porting without a public-API change is the
freeze signal.

## Setup

- **Upstream:** commit `11f810d` (2022-07-23, the last on `master`), cloned into `apps/blazorhero/.backend/`
  (git-ignored) by `pnpm --filter blazorhero backend`.
- **Toolchain:** BlazorHero builds only with the .NET 6 SDK (B1). The script installs it into `.backend/dotnet` with
  Microsoft's dotnet-install script — no admin, nothing system-wide — and runs BlazorHero on its own runtime.
- **Database:** SQL Server LocalDB, a database of its own (`TsazorBlazorHero`) through the connection string;
  `--reset` drops it, and BlazorHero's seeder fills a new one (users `mukesh@blazorhero.com` and
  `john@blazorhero.com`, password `123Pa$$word!`).
- **Ports:** the backend on 5350 (its own WebAssembly client, the reference, at `/`; Swagger at `/swagger`), the
  Tsazor app's dev server on 5352.

## Phases

0. **Backend and reference** — done 2026-10-12: the script, the original client signs in and shows its shell.
1. **Shell and sign-in:** layout (app bar, nav menu, user card, dark mode, language selector), login with the
   JWT and its refresh token, Home; the original's managers and DTOs as TypeScript (B3). The shell already holds
   the SignalR connection (sign-in at the hub, chat notifications, forced token refresh, logout when a role's
   permissions change) and reads every text through its localizer, so both start here:
   - **Translations** (done 2026-10-12): `scripts/resx.mjs` turns the 39 resources into one table per culture
     (`src/i18n`, keys `<Resource>.<name>`) — 505 keys in English, 266 in German.
2. **Catalog:** brands and products — server-paged tables with search, add/edit dialogs, delete confirmation, Excel
   export and import.
3. **Identity:** users, roles, role permissions, user roles, profile and account (password, picture), register,
   forgot and reset password.
4. **Documents and audit:** document store and types, extended attributes, audit trails.
5. **Real time:** the chat page, the dashboard with its charts.
6. **Languages:** the switch between the eleven, right-to-left for Arabic.

Each phase ends with its part of `scripts/verify.mjs` (the app in a browser against the real backend).

## Findings

| # | Area | Finding | Status |
|---|---|---|---|
| B1 | Migration (Blazor) | A Blazor 6 app doesn't build with a newer SDK: the Razor compiler now names component parameters with `nameof(...)`, so MudBlazor 6.0.2's `[Obsolete(error: true)]` parameters (`MudMenu.Direction`, `OffsetX`, `MudBadge.Bottom`, …) are compile errors (CS0619; `RazorLangVersion=6.0` doesn't help). Upgrading the SDK means upgrading the component library first | Noted (migration-practices.md, "How to port" 9); the port builds upstream with the .NET 6 SDK |
| B2 | `@tsazor/dotnet` | BlazorHero's envelope `{ messages, succeeded, data }` fails with HTTP 200 and `succeeded: false`, and carries `messages` on success too ("Product Saved"). `--envelope data,errors` reads non-empty messages as a failure and has no success flag | Open |
| U1 | Upstream | `Accept-Language: *` (Node's fetch sends it) answers every request with a 500: `RequestCultureMiddleware` makes a culture of it. Browsers send real languages | The backend script sends `en-US`; `tsazor-dotnet generate` now asks in English (it hit the 500 too) |
| B3 | `@tsazor/dotnet` (generator) | The Swagger document has no response types: the controllers return `IActionResult`, and client and server share their C# DTOs through `Shared`/`Application`, as hosted WebAssembly apps do. The generated client types the 58 requests and returns `HttpResult<void>` for every response | Port: the original's managers (`Client.Infrastructure`) become TypeScript services with the DTOs ported by hand. A generator option is a proposal for the owner |
| B4 | `@tsazor/dotnet` (generator) | URL-segment API versioning (`api/v{version}/…`, no `SubstituteApiVersionInUrl`) makes `{version}` a parameter of every versioned method and of its name (`getBrandsByVersion("1")`) | Open |
| B5 | `@tsazor/dotnet` | BlazorHero refreshes its token before a request when it expires within a minute (`TryRefreshToken`, a request interceptor), and again when the hub asks (`RegenerateTokens`). `attachJwtAuth` signs requests and logs out on a 401, but can't refresh | Added (owner): `attachJwtAuth(http, provider, { refresh, refreshBefore })` renews once before a request, the others wait; a failed refresh logs out |
| B6 | Library | Every modal of the original opens through MudBlazor's `IDialogService.Show<T>(title, parameters, options)` and awaits its result (add/edit forms, delete confirmation, logout). Tsazor's dialogs are declarative only; MudBlazor, Radzen and Fluent UI Blazor all have the service | To build (owner, 2026-10-12: both skins) |
| B7 | Runtime (parity) | `StringLocalizer` looked a key up in the current culture's table and then the default's. .NET walks the parent cultures first (`fr-FR` → `fr`), and BlazorHero's resources are neutral (`Login.fr.resx`) while its cultures are specific (`fr-FR`) | Fixed: the parent cultures come before the default, with a test |
| B8 | Library | MudBlazor's app frame — `MudLayout` with `MudAppBar`, a persistent `MudDrawer` and `MudMainContent` — has no counterpart: `Drawer` is an overlay | Added: `AppLayout` (`header`, `nav`, `@bind-navOpen`; narrow windows: the column starts closed, lies over the page, Escape or a click on the page closes it) |
| B9 | Library | `MudTextField`'s adornments (the password field's eye button) have no counterpart: `TextInput` has no start or end slot | Added: `TextInput` takes `contentBefore` and `contentAfter` (Fluent: one field box; Bootstrap: an input group) |
| B10 | Library | The account menu opens from the user's avatar (`MudMenu` `ActivatorContent`); `Menu` takes a text label only | Added: `Menu` (Bootstrap: `Dropdown`) takes `labelContent` and `ariaLabel` |
| B11 | Library | A chat notification is a snackbar with an action ("Chat?" opens the chat); `Toaster`'s toasts have no action | Added: `show({ action: { label, onClick } })`, `Toaster.act(id)`; both regions render the button |
| U2 | Upstream | Five Arabic resx files start their names with right-to-left marks (U+200F, `‏‏MainLayout.ar.resx`), so .NET never finds them and those components stay English in Arabic | `scripts/resx.mjs` reads them under their real names |
| U3 | Upstream | Khmer's culture code is `km_KH`, with an underscore — not a BCP 47 tag | Open |
