# Port: fullstackhero (React admin) → Tsazor

The third app port before 1.0 (owner, 2026-10-12), after [FluentCMS](port-fluentcms.md) and
[BlazorHero](port-blazorhero.md). [fullstackhero/dotnet-starter-kit](https://github.com/fullstackhero/dotnet-starter-kit)
(MIT) is a .NET 10 modular monolith whose team **replaced its Blazor client with two React 19 apps** — exactly the
target group: .NET teams who left Blazor for React. The port shows the same app on the same backend in Tsazor. Of the
two apps, the operator console (`clients/admin`: tenants, identity, billing, audits, webhooks, settings — 32 pages,
~22k lines) is ported; the tenant dashboard may follow.

The rules are the earlier ports': the backend stays unchanged, every gap becomes a framework fix with a test or a
finding for the owner, every lesson goes into [migration-practices.md](migration-practices.md). The freeze signal is
judged with a sense of proportion ([port-fluentcms.md](port-fluentcms.md)).

## Decisions

- **UI: the original's look** (owner, 2026-10-13: "Bleibe bei Tailwind/shadcn, das ist eine gute Probe"). Tailwind v4
  (`@tailwindcss/vite`), the original's `globals.css` unchanged, and the shadcn primitives ported as app-owned Tsazor
  components (`src/components/ui`) — shadcn's own model: the app owns its components, a headless library carries the
  behavior. Here that library is **@tsazor/ui** (focus trap, dismissal, scroll lock, roving focus, anchored
  positioning, the Toaster): the port tests whether it carries a third look besides the Fluent and Bootstrap skins.
- **Framework-free code moves unchanged.** The API client (`lib/api-client.ts`), the 14 API modules, the token store,
  the JWT helpers, the runtime config, the permissions, the nav spec: copied as they are (2,200 lines; one import line
  changed: TanStack's `react-query` → `query-core`, lucide's `lucide-react` → `lucide`). cva, clsx and tailwind-merge
  are framework-free too, so the button and badge variants are the original's.
- **TanStack Query stays.** Its core is framework-free, and `useQuery` wraps a `QueryObserver`; Tsazor's `observe`
  takes anything with `subscribe`, so `lib/query.ts` (60 lines) is `useQuery`: options read on every render, a changed
  key switches the query, `keepPreviousData` works. Mutations are plain async handlers with `invalidateQueries`.
- **react-hook-form + zod → EditForm + `StandardSchemaValidator`** (new in the runtime, F8): the original's zod schemas
  unchanged, `register("x")` an `<InputText immediate>` bound to the model (per keystroke, F15), `errors.x?.message`
  the `Field`'s `for="x"`, `shouldFocusError` a `<FocusOnInvalidSubmit />` in the form (F16).
- **sonner → @tsazor/ui's Toaster**, behind a sonner-shaped `toast` (`lib/toast.ts`): the 84 call sites keep
  `toast.success(title, { description, action })`; `FshToaster` renders sonner's markup, which `globals.css` styles.
- **Radix's Portal → the browser's top layer** (F2): dialogs, sheets, menus and the toasts are popovers
  (`lib/top-layer.ts`).
- **React Router → pages and layouts.** Each page has its `@page`; `AppShell` is the default layout, Billing and
  Settings nest theirs, the public pages use `BlankLayout`. `ProtectedRoute` and `RouteGuard` are
  `AuthorizeRouteView` with the `AuthService` as authentication state and one policy per permission
  (`@authorize({ policy: "Permissions.Roles.View" })`); `ForbiddenView` names the missing permission. Pages in
  `src/pages/<area>/` are lazy routes, as the original's.

## Setup

- **Upstream:** commit `a967537` (2026-10-09), cloned into `apps/fullstackhero/.backend/` (git-ignored) by
  `scripts/upstream.mjs`. The original's public files (`/config.json`, the logo) are served from the clone.
- **Acceptance test:** the original's Playwright suite (`clients/admin/tests`, 111 tests in 30 specs, every API call
  mocked with `page.route`) runs **unchanged** against the port: `pnpm --filter fullstackhero acceptance [words]`
  (`--original` runs it against the original admin: 111/111 in Edge). Edge needs `--lang=en-US`: Playwright's
  `locale` alone leaves Edge's `Intl` default at the system language ("129,50 $" on a German Windows). It is a gate
  (owner 2026-10-13): `pnpm --filter fullstackhero verify` in `pnpm gates` and CI's e2e job (Edge), which clones the
  upstream and installs its admin's packages on the first run.
- **Backend:** .NET 10 + Aspire (Postgres, Valkey, RustFS in Docker): `pnpm --filter fullstackhero backend`. It also
  starts the original admin (:5173) and dashboard (:5174); the dev server proxies to the API's HTTPS endpoint
  (:7030, F21). **Live check (2026-10-13):** `pnpm --filter fullstackhero live [--write] [--original]` signs in with
  the seeded `superadmin@root.com`, opens every page — the detail pages through their list's first entry — and
  collects page errors, console errors and API answers of 400 and up; `--write` creates a role, grants a permission
  and deletes it again. The port and the original: 20 pages, 3 detail pages and the role's life, all clean — after
  F22. The acceptance suite needs no backend and keeps to itself even when one runs (F23).
- **Ports:** the port's dev server 5372 (against the real backend), preview 5373, the acceptance's own dev server
  5374 (`--port=` for parallel runs); the original admin 5173, its dashboard 5174.

## How the port is written

Conventions for every area (the reference is the roles list and its create dialog, `src/pages/roles`,
`src/components/roles`):

- **Markup is the original's JSX, in Razor**: `className` → `class` (the same Tailwind strings), `{cond && <x/>}` →
  `@if (cond) { <x/> }`, `.map` → `@foreach (const x of xs) { <X @key="x.id" … /> }`, `{value}` → `@value`. Comments
  `{/* … */}` → `@* … *@`. Text that ends in a letter before `@` is an email to Razor (`Overview@if` stays text):
  `<text>Overview</text>@if (…)`.
- **Template literals, never C#'s `$"…"`** (TZS024 catches it): `aria-label="@(`Open role ${role.name}`)"`, or an
  attribute with an expression inside: `id="@(id)-error"`.
- **Components**: React function components become `.tsazor` files (PascalCase names); props become `@Parameter()`s;
  a `ReactNode` prop is `x` (text) plus an `xContent` slot (`<TitleContent>…</TitleContent>`); a callback prop is an
  `EventCallback` (`onSelect`), `value`/`onChange` pairs are `value` + `valueChanged` (`@bind-value`). A subcomponent
  local to a page becomes its own file next to the page.
- **Hooks**: `useState` → fields; `useMemo` → getters; `useEffect` with a timer → the handler sets it, `dispose()`
  clears it; `useQuery` → `new Query(() => ({…}))` + `this.observe(query)` in `onInitialized`; `useAuth()` →
  `@inject AuthService auth` + `this.observe(auth.changes)`; `useNavigate()` → `@inject NavigationManager navigation`;
  `useParams()` → the page's route parameter (`@page "/roles/{id}"` + `@Parameter() id`).
- **The primitives** (`src/components/ui`): Button, Badge, Card*, Input, Label, Skeleton, Avatar, Icon (lucide nodes:
  `<Icon icon="@Plus" class="size-4" />`), Dialog + DialogContent/Header/Title/Description/Body/Footer, SheetContent,
  DropdownMenu + Trigger/Content/Item/Label/Separator, Select (filter), Switch, Table*, ConfirmDialog. `asChild` →
  the variants function on the element: `<a href="…" class="@buttonVariants({ variant: "outline" })">`.
- **The list kit** (`src/components/list`): EntityPageHeader, PageHeader, Stat/StatStrip, ErrorBand, LoadingRow,
  Pagination, FilterBar, Field, FormSelect (list/select.tsx — the name `Select` is the filter one), FormShell/
  FormSection/FormActions, SettingsSection/SettingsField, ToneIconTile; and `src/components`: EmptyState, KpiTile,
  Monogram, SectionRule, ForbiddenView.

## Phases

1. **Shell and sign-in** — done 2026-10-13: login (with the DEV demo dialog), session restore, the shell (sidebar
   with accordion and rail, topbar with the user menu and sign-out, mobile drawer, notification bell with SignalR),
   the dashboard, the inactivity guard, not-found, forbidden. With identical mocks, the port's dashboard and its open
   user menu are visually indistinguishable from the original's (light and dark).
2. **The areas** — done 2026-10-13, ported in parallel by five agents on the conventions above: identity (users,
   roles, sessions), tenants and impersonation, billing, operations (audits, webhooks, health, notifications),
   account (settings with profile picture upload and two-factor setup, password reset, email confirmation).
   - **Acceptance: 111/111** — the original's whole Playwright suite, unchanged, against the port.
   - **Visual** (`scripts/visual.mjs`: the same suite against both apps, the screenshot at each test's end compared
     pixel by pixel): 94 of 111 within 0.5%, 77 identical. The rest end mid-transition — a test that submits and
     navigates catches the original still loading its lazy chunk — or with a toast's countdown at another moment.
   - **Size** (production build, 2026-10-15, gzip -9): the first load is 364 KB (101 KB gzip) against the original's
     613 KB (187 KB); all chunks together 269 KB gzip against 322 KB. Where the bytes go:
     [bundle-size.md](bundle-size.md). The framework and its built-ins weigh less than React and its libraries, and
     the compiled components weigh more than the JSX.
   - **Source:** 17,700 lines in 253 files against the original's 22,200 in 128 — fewer lines (no hook plumbing,
     Razor's markup), more files (a page's local subcomponents become files: no module scope, no Razor templates, F3).
3. **Against the backend** — once Docker runs: the API, the realtime hub, uploads to RustFS (whose CORS allows the
   original's dev origins, :5173 and :5174, only — the port's uploads need its origin or a proxy).

## Findings

| # | Area | Finding | Status |
|---|---|---|---|
| F1 | Compiler | shadcn types a variant parameter with cva's `VariantProps<typeof buttonVariants>["variant"]`. The compiler decides from a parameter's declared type whether `variant="outline"` is text, and reads that type syntactically: a computed type (indexed access, conditional, a global utility) counts as a value, so the text is read as an expression (`TS2339 Property 'outline' does not exist`). Razor decides from the real type | **Fixed** (owner 2026-10-13): a computed type takes text as text (the string lowering) and `tsazor check` checks it against the real type, no TZS026; Button and Badge take cva's `VariantProps` again |
| F2 | Library | Radix renders overlays in a Portal at the end of `<body>`. Tsazor (like Blazor) has none, and @tsazor/ui's overlays are `position: fixed`, so inside an ancestor with `transform`, `filter` or `backdrop-filter` they are placed and clipped relative to it — the original's topbar (`backdrop-blur`) holds the user menu and the sign-out dialog, its dialogs center with `-translate-x-1/2` | **Fixed** (owner 2026-10-13): @tsazor/ui's `topLayer` (`popover="manual"` + `showPopover()`, the popover's box undone, `raiseInTopLayer` for the toasts); both skins' overlays, tooltips and the sortable indicator are in the top layer. The port's `lib/top-layer.ts` re-exports it |
| F3 | Language (parity) | Razor templates — `RenderFragment body = @<div>…</div>;` in `@code` — don't exist. React devs write `const body = <div>…</div>` constantly; Blazor devs use templates for the same | **Fixed** (owner 2026-10-13): Razor templates in `@code` — `@<tag>…</tag>` is a RenderFragment, `(item: T) => @<li>…</li>` a RenderFragment<T>, typed by `tsazor check` |
| F4 | Tooling | The metadata host followed relative imports and packages, not tsconfig `paths`: with the `@/*` alias (shadcn's and Vite's React template's), every parameter typed from `@/…` was "unknown" (TZS026) and `count="5"` passed "5" | Fixed: the host follows `paths` from the nearest tsconfig (its `extends` chain, comments), for imports and `@import`ed components; a workspace test |
| F5 | Runtime (parity) | `ValidationSummary` renders `<ul class="validation-summary"><li>`; Blazor renders `<ul class="validation-errors"><li class="validation-message">` (its class wins over a passed one). Blazor apps' CSS targets those | **Fixed** (owner 2026-10-13): Blazor's markup and classes; the tutorial styles `.validation-errors` |
| F6 | Runtime (parity) | Blazor's `InputBase` sets `aria-invalid="true"` while the field has messages (a caller's own value kept then, dropped once valid); Tsazor's set none — screen readers missed the state, Tailwind's `aria-invalid:` styling had nothing to match | Fixed, with a forms test |
| F7 | Runtime (parity) | `NavigationManager.HistoryEntryState` (Blazor 7+) was missing: the state only reached LocationChanged's args. The login reads "where the user came from" from it (React Router's `location.state.from`; the URL stays `/login`, which the original's specs check) | Fixed: set by every navigation, restored on back/forward and after a reload; a navigation test |
| F8 | Runtime (forms) | react-hook-form's `zodResolver` has no counterpart: EditForm validates with DataAnnotations decorators or a function per field. zod (and Valibot, ArkType) implement Standard Schema | Added: `StandardSchemaValidator` (Tsazor extension, the Blazored.FluentValidation shape): issues by path → field messages, a field change updates its field, async schemas warn; runtime tests |
| F9 | Migration (React) | Razor's email rule: in `Overview@if (…)`, the `@` after a letter is literal text, where JSX's `Overview{cond && …}` isn't | Lesson (migration-practices.md): `<text>Overview</text>@if (…)` |
| F10 | Runtime (parity) | Nested layouts didn't work: a layout's own `@layout` was recorded for the route manifest only, and RouteView and LayoutView wrapped a page in one layout. Blazor's LayoutView follows each layout's `[Layout]` outward. Billing and Settings are layouts inside AppShell | Fixed: the compiler emits a component's own `@layout` as `static layout` (Blazor's attribute), `renderWithLayout` (RouteView, LayoutView, AuthorizeRouteView) wraps outward along the chain — the outer layout keeps its instance across pages; RouteView falls back to the page's own; a repeat ends the chain. Compiler and routing tests |
| F11 | Runtime (parity) | `NavigationManager.GetUriWithQueryParameter(s)` (Blazor's NavigationManagerExtensions) was missing: the audits page writes its filters and page into the URL (React's `useSearchParams`), and needed a helper of its own | Added: `getUriWithQueryParameter(name, value)`, `getUriWithQueryParameters([uri,] parameters)` — Blazor's algorithm (in place, case-insensitive names, arrays, null removes, fragment kept, `Uri.EscapeDataString`, `True`/`False`); dates as ISO 8601, which `@SupplyParameterFromQuery()` reads back (Blazor writes its invariant default). Tests |
| F12 | Tooling | In `tsazor check`, a value typed `unknown` couldn't be passed to a component parameter typed `unknown` (`payload="@event.payload"`: TS2345, `AttributeValue` excludes `unknown`); Blazor's AddAttribute takes `object?` | Fixed: `addAttribute` has a second signature for `unknown` (the first keeps a lambda's contextual typing) |
| F13 | Tooling | A default import of a `.tsazor` through the `@/` alias was typed as the ambient `ComponentType`, not the class: `<LayoutView Layout="@AppShell">` failed with TS1360. F4 covered the metadata; the type checker's shadow modules rewrote only relative `.tsazor` imports | Fixed: the shadows follow tsconfig `paths` too; a shadow-module test |
| F14 | Runtime (parity) | Blazor's "custom input" idiom — inherit InputText, render `@attributes="AdditionalAttributes" class="@CssClass"` — gets the validation class and `aria-invalid` from the base. Tsazor had neither `CssClass` nor the attributes; two areas re-implemented both | Added: `cssClass` and `attributesWithValidation` (Blazor's rule). Deviation: Blazor writes aria-invalid into AdditionalAttributes itself; here `additionalAttributes` stays the caller's, because the skins show the invalid state only after a submit (their deliberate design). A forms test |
| F15 | Forms (React) | react-hook-form's `register()` sees every keystroke (a live preview, a derived identifier, `isDirty` enabling Save); InputText binds on `change` | **Fixed** (owner 2026-10-13): `immediate` on InputText and InputTextArea — binds per keystroke, the field change on `change`, re-validation per keystroke while the field has a message; the port's LiveInputText is gone |
| F16 | Forms (React) | react-hook-form focuses the first invalid field after a failed submit (`shouldFocusError`, on by default); EditForm (Blazor's too) leaves the focus on the button | **Fixed** (owner 2026-10-13): the runtime's `<FocusOnInvalidSubmit />` inside the EditForm (named as FocusOnNavigate, `selector` default `[aria-invalid="true"]`); the port's FocusFirstError is gone |
| F17 | Language | A slot can't be left out conditionally: React's `footer={cond ? <x/> : undefined}`; a written `<Footer>` is always set, so the section draws an empty stripe (a variant of F3) | **Fixed** (owner 2026-10-13): with a Razor template (F3) the slot is a value: `Footer="@(cond ? footer : undefined)"` |
| F18 | Library | The headless kit's overlays focus their first focusable element only when the app passes `initialFocus`; Radix focuses the first tabbable by default (a date input, a textarea) | Port: DialogContent and SheetContent pass `[autofocus]`, else the first focusable |
| F19 | Tooling | Without metadata (before F4), a method group passed to a parameter not named `On*` was emitted bare (`valueChanged="@onImageChange"` lost `this`), and TZS027 named an unrelated `<Button>` for a slot of an unresolved component. Both were dev-server only (the plugin bundle predated F4) | Gone with F4. Proposals: treat `*Changed` like `On*` when the metadata is unknown; TZS027 should say the parent is unknown |
| U1 | Upstream | The original's dev proxy sends a page load of its own `/health` route to the API; its health spec works around it for :5173 only | Port: the proxy hands a document request to the app |
| F20 | Migration (CSS) | The original's toasts don't look like its `globals.css` says: the `.fsh-toast` overrides live in a Tailwind layer, and sonner injects its stylesheet unlayered — an unlayered rule beats a layered one whatever its specificity. So they are 356px wide with 16px padding and a 16px icon | Port: sonner's cosmetic rules, unlayered too (`styles/sonner-toast.css`). Lesson: compare computed styles, not the source |
| F21 | Backend (port) | The dev server proxied `/api` to the API's HTTP endpoint (:5030), which redirects to HTTPS with a 307 — and a redirect drops the `Authorization` header, so every call signed in failed. The AppHost gives the original `VITE_API_BASE_URL` = the HTTPS endpoint | **Fixed:** the HTTPS endpoint (:7030) as the default, as the original runs under Aspire |
| F22 | Realtime (port) | Against the real backend, the sign-in logged "The connection was stopped during negotiation": the realtime connection was rebuilt on every token store notification, and a sign-in sends the permissions right after the tokens. The original's provider does the same (`tokenEpoch`) and wins the race only by timing | **Fixed:** the service rebuilds the connection when the access token changes, the only thing it depends on |
| F23 | Acceptance | With the backend running, `tenants/branding.spec.ts` failed 0/5: the acceptance reused the dev server on :5372, which now reached the real API — it answered the calls the spec doesn't mock with a 401 for the spec's made-up token, and the app signed out. The original's specs assume no backend behind the dev server | **Fixed:** the acceptance starts a dev server of its own (:5374) that proxies to nowhere (`VITE_API_BASE_URL=http://127.0.0.1:9`); 111/111 with the backend up |
