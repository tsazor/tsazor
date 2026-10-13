# Port: BlazorHero → Tsazor

The second app port before 1.0 (owner, 2026-10-12), after [FluentCMS](port-fluentcms.md). Where FluentCMS was a
Blazor Server admin behind a cookie BFF, BlazorHero is the typical Blazor WebAssembly app of a .NET team from
2021–2023: [fullstackhero/blazor-starter-kit](https://github.com/fullstackhero/blazor-starter-kit) (MIT), hosted
WebAssembly on MudBlazor 6, Identity with JWT and refresh tokens in the browser, SignalR (chat, notifications),
localization (resx, eleven languages, Arabic right-to-left), a dashboard with charts, server-paged tables with Excel
export and import.

The rule is FluentCMS's: the backend stays unchanged, every gap becomes a framework fix with a test, every lesson
goes into [migration-practices.md](migration-practices.md). The freeze signal is FluentCMS's too: the public API
stops moving while the port goes on, judged with a sense of proportion
([port-fluentcms.md](port-fluentcms.md)).

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
1. **Shell and sign-in** — done 2026-10-12 (`scripts/verify.mjs`, 38 checks): layout (app bar, nav menu, user
   card, dark mode, language selector), login with the JWT and its refresh token, Home; the original's managers and DTOs as TypeScript (B3). The shell already holds
   the SignalR connection (sign-in at the hub, chat notifications, forced token refresh, logout when a role's
   permissions change) and reads every text through its localizer, so both start here:
   - **Translations** (done 2026-10-12): `scripts/resx.mjs` turns the 39 resources into one table per culture
     (`src/i18n`, keys `<Resource>.<name>`) — 505 keys in English, 266 in German.
2. **Catalog** — done 2026-10-12 (`scripts/verify.mjs`, 66 checks with phase 1): brands and products —
   server-paged tables with search, add/edit dialogs, delete confirmation, Excel export and import. Brands are a
   DataGrid of the filtered list (MudTable Items + Filter), products one with an ItemsProvider (ServerData); the
   product dialog picks its brand in an Autocomplete and shrinks the picture with `requestImageFileAsync`.
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
| B6 | Library | Every modal of the original opens through MudBlazor's `IDialogService.Show<T>(title, parameters, options)` and awaits its result (add/edit forms, delete confirmation, logout). Tsazor's dialogs are declarative only; MudBlazor, Radzen and Fluent UI Blazor all have the service | Added: `DialogService` (`@tsazor/ui`), `DialogProvider` and a hosted `Dialog` (isOpen unset) in both skins; the skins' setup registers the service and puts the provider into the layout |
| B7 | Runtime (parity) | `StringLocalizer` looked a key up in the current culture's table and then the default's. .NET walks the parent cultures first (`fr-FR` → `fr`), and BlazorHero's resources are neutral (`Login.fr.resx`) while its cultures are specific (`fr-FR`) | Fixed: the parent cultures come before the default, with a test |
| B8 | Library | MudBlazor's app frame — `MudLayout` with `MudAppBar`, a persistent `MudDrawer` and `MudMainContent` — has no counterpart: `Drawer` is an overlay | Added: `AppLayout` (`header`, `nav`, `@bind-navOpen`; narrow windows: the column starts closed, lies over the page, Escape or a click on the page closes it) |
| B9 | Library | `MudTextField`'s adornments (the password field's eye button) have no counterpart: `TextInput` has no start or end slot | Added: `TextInput` takes `contentBefore` and `contentAfter` (Fluent: one field box; Bootstrap: an input group) |
| B10 | Library | The account menu opens from the user's avatar (`MudMenu` `ActivatorContent`); `Menu` takes a text label only | Added: `Menu` (Bootstrap: `Dropdown`) takes `labelContent` and `ariaLabel` |
| B11 | Library | A chat notification is a snackbar with an action ("Chat?" opens the chat); `Toaster`'s toasts have no action | Added: `show({ action: { label, onClick } })`, `Toaster.act(id)`; both regions render the button |
| U2 | Upstream | Five Arabic resx files start their names with right-to-left marks (U+200F, `‏‏MainLayout.ar.resx`), so .NET never finds them and those components stay English in Arabic | `scripts/resx.mjs` reads them under their real names |
| U3 | Upstream | Khmer's culture code is `km_KH`, with an underscore — not a BCP 47 tag | Open |
| U4 | Upstream | `ClientPreferenceManager.IsRTL()` answers false whenever dark mode is on, so right-to-left is lost on a reload in dark mode; `ToggleDarkModeAsync` answers the opposite of "is dark now" (the layout compensates) | Not copied: the port's manager answers what is stored |
| B12 | Language (parity) | The original protects every page with one `@attribute [Authorize]` in `_Imports.razor`, the anonymous ones opting out with `[AllowAnonymous]` — a common Blazor pattern. Tsazor's `@authorize` doesn't inherit (TZS014, decided earlier: no opt-out needed), so each page says it | Port: `@authorize` per page. Proposal for the owner: inheritance with `@allowAnonymous`, as Blazor |
| B13 | Library | The nav menu groups its links under headings (`MudListSubheader`: Personal, Document Management, Administrator, …); `SidebarNav` had one flat list | Added: `SidebarNav`'s `sections` (`{ heading, links }`), each a group named by its heading, in both skins |
| B14 | Runtime (parity) | Blazor's `AuthorizeRouteView` renders `NotAuthorized` and `Authorizing` in the default layout (`RenderContentInDefaultLayout`), with "Not authorized"/"Authorizing..." when none is given; BlazorHero's login sits in `MainLayout` that way. Tsazor rendered them without a layout and showed nothing by default | Fixed: both in the default layout (the layout stays on sign-in), Blazor's texts by default; a conformance test now expects the layout |
| U5 | Upstream | `Login.OnInitializedAsync` compares the authentication state with a new anonymous one by reference (`!=` on objects), which is always unequal, so it always navigates to `/`. It means to send a signed-in user away from the login | Port: navigates only when the user is signed in |
| U6 | Upstream | `Login`'s `Validated` runs the validator while rendering, so every message shows before the first key; Sign In stays disabled until the form is valid | Port: Sign In stays enabled. Tsazor's fields show their messages after a submit (an edit marks the field invalid), so a disabled submit would leave the user with red borders and no reason (WCAG 3.3.1) |
| B15 | Library | Hangfire, the guide and Swagger open in a new tab (`MudNavLink Target="_blank"`); `SidebarNav`'s links had no target, so the router took `/jobs` and `/swagger` as app pages | Added: a link's `target`, in both skins (the router leaves a link with a target to the browser, as Blazor's does) |
| B16 | Library | The Fluent `AppLayout`'s header is the brand colour, but its transparent buttons kept the gray ink of a light surface (MudAppBar's buttons take `Color.Inherit`; the Bootstrap header is dark-themed). The signed-out bar is the same bar without a drawer | Fixed: transparent and subtle buttons in the header take its ink and darken the brand on hover; `AppLayout` without `nav` renders no column (header over the page) |
| B17 | Library (bug) | The Fluent toasts' intent accent never showed: the rule used `border-start-start-color`/`-width`, which don't exist (only the corner radius has that name), and the browser dropped them silently | Fixed (`border-inline-start-*`); the skins gate now checks every property in the packages' stylesheets with `CSS.supports` |
| B18 | Runtime | A component that resolves the `StringLocalizer` twice — two `localizerFor` field initializers, or `this.inject` in a lifecycle method that runs on every parameter set — subscribed once per call (the DEV warning "observed twice", and a render per subscription) | Fixed: a culture-aware service re-renders a component through one subscription, however often it is injected; a conformance test |
| U7 | Upstream | The hub sends `ConnectUser` to every client, but only the chat page handles it, so each signed-in client logs SignalR's "No client method with the name 'connectuser' found" (the .NET client logs it as well) | Kept (parity) |
| B19 | Library (bug) | `FluentProvider`'s `tokenOverrides` didn't reach the tokens made of others: `--fui-accent` and `--fui-brand-background` were resolved on `:root` with Fluent's ramp, so BlazorHero's blue ramp left buttons, the header and links in Fluent's blue (only the dark theme, declared on the provider, followed) | Fixed: the alias tokens are declared on every provider too and resolve against its overrides; the skins gate checks a ramp override in light, dark and under a dark document. With the ramp in effect, BlazorHero's #1976D2 was 4.4:1 as link text, so its ramp is one step darker (brand-80 #1565C0) |
| B20 | Library | `FluentProvider theme="light"` doesn't opt out of the OS's dark mode: "light" is the default and means "inherit", so under a dark OS an app with its own dark-mode switch shows dark while its preference says light | **Fixed** (owner 2026-10-13): `theme` defaults to `"system"` (Fluent UI Blazor's `DesignThemeModes.System`), an explicit `"light"` pins light; the port dropped the `<html>` attribute, NotFoundLayout pins light as the original's DefaultTheme |
| B21 | Migration (Blazor) | `MudForm` is a `div`; `FluentForm` (like Blazor's `EditForm`) is a `<form>`, so a `type="email"` field gets the browser's own check first: "mukesh" stops the submit with the browser's bubble, and the validators' message never shows | Port: `novalidate` on the form, as Blazor apps do (migration-practices.md) |
| B22 | Runtime (parity) | The product dialog shrinks its picture with `IBrowserFile.RequestImageFileAsync(format, 400, 400)`; Tsazor's InputFile hands out the browser's `File` and had no counterpart. Blazor's InputFile.ts also empties the input on a click (the same file again raises OnChange) and notifies on a cancelled dialog; Tsazor did neither | Added: `requestImageFileAsync(file, format, maxWidth, maxHeight)`, the click and cancel listeners; Blazor's InputFile E2E suite in the parity gate (6 of 7; the size cap of `OpenReadStream` has no counterpart) |
| B23 | Library | `MudTablePager` offers the rows per page (10, 25, 50, 100); the Paginator had no choice, and changing `itemsPerPage` didn't reload the grid | Added: `Paginator`'s `pageSizeOptions` and `pageSizeLabel` (both skins), `PaginationState.setItemsPerPageAsync` (back to the first page, the grid reloads) |
| B24 | Library | `HeroTitle` is `MudText Typo.h5` — the h5 size as the page's heading. `Typography` ties the element to the size (MudText has `HtmlTag`, Fluent UI React `as`), so an h1 in an h5's size needs plain markup | Added (owner): `Typography`'s `as` in both skins (Bootstrap: `<h1 class="h5">`); HeroTitle is `<Typography variant="h5" as="h1">` |
| B25 | Library (bug) | The Fluent DataGrid's `align="end"`/`"center"` reached the cells but not the header: the table's header rule (`text-align: start`) outweighed the alignment class | Fixed; the skins gate checks an end-aligned column's header and cells |
| B26 | Library | `MudAutocomplete For=…` takes part in the form (its message, its invalid state); the Autocomplete was the one value input outside the forms — no message, no field-changed notification | Added (both skins): `@bind-selectedOption(s)` passes the field (`selectedOptionExpression`), a pick notifies the EditContext, the message shows after a submit as at the inputs, with `aria-invalid` |
| B27 | Runtime (typing) | `@CascadingParameter({ type: HubConnection })` didn't compile: the type option required a public constructor, and SignalR's HubConnection is built by a builder (private constructor). `instanceof` works with any class | Fixed: `CascadingTypeToken` (`{ prototype, name }`) takes any class; a conformance test with a private constructor |
| B28 | Library | Products sort on the server by MudTable's `SortLabel`; a TemplateColumn with a `sortKey` but no client `sortBy` lambda wasn't sortable (QuickGrid reads the name from SortBy's expression tree, which TypeScript has none of) | Fixed (both skins): a `sortKey` alone makes a TemplateColumn sortable through an ItemsProvider |
| B29 | Library (i18n) | The library's own texts are English only: the Paginator's "Page 2 of 7", "First page", "items", the grid's "Loading…" and "No entries", the dialog's "Close", the chips' "Remove …". MudBlazor (parameters such as `RowsPerPageString`, and `MudLocalizer`) and Fluent UI Blazor (`IFluentLocalizer`) localize theirs; BlazorHero runs in eleven languages | Fixed (owner): every text has a reserved key `tsazor.ui.<name>` in the app's tables, English by default, plural by `Intl.PluralRules`, re-rendered on a culture change; text parameters still win (design-localization.md §4a) |
| U8 | Upstream | The delete confirmation formats "Delete Content" with the id, but its resources say "Delete Content" (no `{0}`), in English and German alike | Kept (parity) |
| U9 | Upstream | `ServerReload` goes back to the first page whenever a search is set, on every reload: the search's results can't be paged | Port: a new search starts on the first page; its results page |
| U10 | Upstream | The search string goes into the product and export URLs unencoded (`&` or `#` in a search breaks them) | Port: encoded |
