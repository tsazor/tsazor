# Handoff: component library, core extensions, tutorial (status 2026-10-07, evening)

**Read first:** this document, then [roadmap-1.0.md](roadmap-1.0.md) and
[design-component-library.md](design-component-library.md). Branch `roadmap/phase-0`, HEAD `92f2b89`,
everything pushed.

> **Update 2026-10-08, evening — the main track is now the FluentCMS port: [port-fluentcms.md](port-fluentcms.md).**
> - **The decision:** quality isn't 1.0-ready yet; the API still moved a lot.
>   - Before R2/1.0, a real Blazor app is ported: FluentCMS's admin, with `@tsazor/fluent`.
>   - Every gap becomes a framework fix with a test.
>   - The freeze signal: the public API stops moving while the ports go on — judged with a sense of proportion,
>     not by a clock (owner, 2026-10-12; the yardstick is in port-fluentcms.md).
> - **Track B (owner):** complex components are a port of their own (reference: Fluent UI Blazor).
> - **Done so far:**
>   - phases 0–2: backend script, BFF, shell, sign-in, every management screen but files and content types;
>   - phase 3: file management (folders, multipart upload through the BFF, rename, move, delete);
>   - 29 findings, most of them fixed in the framework (phase 3: F5 multipart in `@tsazor/dotnet`,
>     `BreadcrumbItem.onClick`, `@ref="this.x"`, forwarding an unset callback, `InputFile` awaiting `onChange`);
>   - in `@tsazor/fluent`: CheckboxGroup, TreeView, `Button href`, five file icons.
> - **Gates:** `pnpm --filter fluentcms verify` (in `pnpm gates` and CI's e2e job).
> - **Track B's purpose (owner):** proving that complex components *can* be built, not better components; pick
>   by the capability a component proves (see port-fluentcms.md).
> - **Phase 4 done:** content types and their field settings, contents built from 27 field views (rich text as an
>   embedded Quill, `@tsazor/fluent`'s new Autocomplete, file pickers); findings F30–F35, upstream U2 (dates in the
>   server's culture: the port's backend runs invariant).
> - **Phase 5 done (the public site):** the layouts stored in the CMS render in the browser (HTML with component
>   tags, Scriban expressions, their scripts), with the seven view plugins. Their HTML is compared with FluentCMS's
>   own render, character for character (the backend serves it for the site's host). The Scriban subset is checked
>   against Scriban 5.12 itself. Findings: F36 (a tutorial lesson, "Markup with components"), F37
>   (`addComponentParameter`), upstream U3 and U4. The site builder stays out of scope.
> - **Small findings closed:** F21 (`onClosed` carries no event), F23 (Razor parity confirmed; one TZS024 with a quick
>   fix instead of a cascade), F35 (`waitUntilIdle({ timeout })` names the pending work).
> - **F38 (2026-10-09, found by the owner using the site):** every navigation flickered. `SectionOutlet` keys on
>   the fragment; C#'s delegate equality kept Blazor's head stable, a JS function didn't. Fixed with compiler hint
>   H4 (child content without outer locals is cached on the component; see design-render-hints.md) and stable
>   fragments in `PageTitle`/`HeadOutlet`. Lesson: checks compared content, none checked that elements stay.
> - **F39 → E13 (2026-10-09, owner):** switching quickly between pages showed dark flashes. While its plugins
>   loaded, the new page was empty for a few frames and the template's dark footer moved up. FluentCMS is static SSR
>   with enhanced navigation and swaps the finished page in one step. The fix: a navigation holds the previous page
>   (a view transition without animation) until the new one has its data. On by default (the owner's decision),
>   `routing.holdPreviousPage: false` turns it off. A navigation during the hold joins it, and a click on a held
>   link follows it. See design-navigation-hold.md. verify measures the painted frames. Lesson: measure what the
>   browser paints (CDP screencast) and with latency. On localhost the flash came only sometimes.
> - **E13 verified and committed (2026-10-09):** `pnpm gates` 31/31 after the two fixes below, the port's verify
>   70/70 (painted frames: 0 of 11 with a dark band), the runtime, tutorial and port tests. Two fixes the gates found:
>   - the port's `backend.mjs` asked `IsInitialized` without the API token. A set-up FluentCMS answers it only with
>     the token, so a second start failed. Unnoticed while the first backend ran, until the restart (`0bb0464`);
>   - the tutorial's ch14 hash check read the list right after the click. With the hold, URL and page change a frame
>     later, and WebKit sometimes saw the old list. The check now waits for both.
> - **Dogfood feedback (owner, 2026-10-09)**, for an app with charts, a live event feed and Sleipnir:
>   - Virtualize knows a fixed `itemSize` only. Blazor measures the rendered items, so this is a parity gap, and
>     there is no stick-to-bottom.
>   - F17: an app can't bring its own icons.
>   - The guide to integrating a chart library via `@attach`, promised in design-component-library.md, is
>     missing.
>   - Publishing is tested only through tarballs. The suggestion is a local registry (Verdaccio) with
>     prereleases, which R2 needs anyway.
>   - There are no soak tests for long-open tabs.
> - **Library completeness (owner, 2026-10-09):** the dogfood assessment of AgentView (a new app: roadmap, branch map,
>   approval inbox, coverage charts, decision log, live feed, chat) hit missing components at once. Owner: "A complete
>   component library is important, otherwise you always hit a wall … Without a complete library, nobody will move to
>   Tsazor." Decided: waves A and B of [design-library-completeness.md](design-library-completeness.md) before 1.0
>   (reference: Fluent UI Blazor + MudBlazor), both skins at once, `@tsazor/markdown` on marked + DOMPurify, charts as
>   an `@attach` guide now and `@tsazor/charts` in wave B. Building them is also a core test vehicle (findings L1, L2, …).
>   **Order:** Virtualize at Blazor 11 parity (core; [design-virtualize.md](design-virtualize.md), spec in
>   [blazor-virtualize-net11.md](blazor-virtualize-net11.md)) → icons (F17) and Markdown → rest of wave A → wave B.
> - **Parity baseline: Blazor 11** (owner, 2026-10-09). Its Virtualize measures rows and has `AnchorMode.End`, so the
>   dogfood's feed and chat are parity work. Decided for Virtualize: aliases for `Overscan`/`ItemTemplate`, fix all of
>   Blazor's probable bugs (each a test), port all of Blazor's tests (new gate app `apps/blazor-parity`), DataGrid as
>   QuickGrid 11.
> - **Virtualize at Blazor 11 parity (2026-10-09, done):**
>   - Committed: `5c6062b` (the port, both DataGrids as QuickGrid 11, `@tsazor/testing` renders like bUnit, Blazor's
>     47 unit tests) and `cd74706` (the new gate app `apps/blazor-parity` with Blazor's own E2E suite).
>     Groups A–F, I and J are green in Edge, Firefox and WebKit, 128 cases each.
>   - Tsazor fixes sixteen Blazor bugs (A1–A16, design-virtualize.md §6). The gate found A11 (WebKit drift in the
>     manual anchoring Safari always uses) and A12 (Home soon after End was pulled back to the bottom).
>   - **Groups G, H, K, M and QuickGrid (L, both skins) ported (2026-10-09, late):** 513 cases per browser. They
>     found four more component bugs, fixed with unit tests: A6 with a provider (a delete above wasn't found), A13 (a
>     user scroll didn't cancel a pending `scrollToItem`; quarantined in Blazor), A14 (rows replacing placeholders
>     moved the visible row), A15 (an Edge race: `scrollToItem` grew the window once and ran away from its target).
>     And a compiler gap: `TGridItem` wasn't inferred from `ItemsProvider` (`e983d1e`; where nothing can be
>     inferred, the errors now carry Razor's RZ10001 as their hint). Commits `88e11a5`, `c0de536`.
>   - The tutorial lessons "Long lists" and "A live feed" (ch12, flag `layoutOnly`; `d4998a4`). The feed's browser
>     check found A16 in Firefox and WebKit (`955c9bb`): a reader who scrolled up was pulled back to the bottom,
>     because a scroll during a convergence, or after a pin that didn't move, was swallowed.
> - **Icons (F17, wave A; [design-icons.md](design-icons.md)):** done (steps 1–3 on 2026-10-09, 4–6 on 2026-10-10).
>   - `c497ae8`: `IconValue` and `icon()` in `@tsazor/ui` (an app's own icons); both skins' `Icon` take `value`,
>     `color`, `title`; `@tsazor/bootstrap` got `Icon`.
>   - `15c1001`: `@tsazor/fluent-icons` (20,786 Fluent System Icons, `Icons.Regular.Size20.Save`, generated from
>     `@fluentui/svg-icons`); `35a1c3f`: `@tsazor/bootstrap-icons` (2,078, `Icons.Alarm`). Tree-shaking proved by a
>     Vite build test (nested `export * as` namespaces: Rollup keeps only the reached icon).
>   - **Steps 4 and 5 done (2026-10-10):** icon slots with Fluent UI Blazor main's names (Button, MenuItem/
>     DropdownItem, Badge, NavbarLink `iconStart`/`iconEnd`; Tab `iconStart`; TreeViewItem's four; SidebarNav links
>     `icon`/`iconActive`); `Icon` sizes a value by its own viewBox; the skins draw their own icons from a small copy
>     of their set (`src/core-icons.ts`, D-I4, kept equal by a test). The browser is the skins app's Icons page
>     (Fluent by variant and size, Virtualize); the codemod rewrites `new Icons.X.Y.Z()`. Found on the way: L1
>     (`withAttributes` dropped a component's class for `class=null`) and L2 (TextInput/TextArea lacked `Immediate`;
>     now `ImmediateInput` in `@tsazor/ui`). `@tsazor/fluent-icons/<variant>/<size>` entry points give a light dev
>     start (the namespace costs ~1 s there). The gallery's gates take `GALLERY_PORT` (a fresh server beside a
>     running one).
>   - **Step 6 done (2026-10-10), F17 closed:** the FluentCMS port uses the original's 38 icons (`IconName.ts`
>     from its `IconResource.resx` via `icon()`, `scripts/icons.mjs`); row actions are icon buttons with tooltips
>     (`ActionButtons` cascades `TableAction`, as in FluentCMS). Found L4: `icon()` drew outline icons filled (the
>     root's `fill="none"` was lost). `name`/`builtInIcons` deprecated.
> - **Markdown (wave A, D-L3), 2026-10-10, done:** `@tsazor/markdown` — `Markdown` (MudMarkdown's `Value`) on marked
>   18.0.14, always sanitized with DOMPurify 3.4.16 (own instance, its hooks don't touch an app's); external links get
>   a new tab and `rel="noopener noreferrer"`; `breaks`, `inline`, `highlight`, `tableClass`, `allowTags`/
>   `allowAttributes`; `renderMarkdown()`; `markdown.css` in Fluent's, else Bootstrap's tokens. Tests under jsdom
>   (L5: DOMPurify doesn't sanitize under happy-dom); the skins app's Content page and its gate check the sanitizing
>   in Edge, Firefox and WebKit; axe found L6 (task checkbox names, inline code contrast). The root `pnpm test` now
>   also runs ui, the icon sets, markdown and worker (CI's `pnpm -r test` always did).
> - **Wave A components, 2026-10-10 (pushed through `3a485e3`):** Avatar (`a692b93`; Fluent 2's persona palette in
>   `styles/avatar-colors.css`), Chip/ChipSet (`6349da6`; `ChipSetModel` in `@tsazor/ui`), Timeline (`f6ef67f`; subgrid,
>   so the dots line up), Wizard (`3a485e3`; forms in a step register through `WizardFormLink`). `@tsazor/bootstrap` has
>   a stylesheet of its own now, `tsazor-bootstrap.css` (the sidecar CSS, in `--bs-*` variables). L7: the builds keep
>   `dist/` in place, so a running dev server sees a rebuild. Each component: behavior in `@tsazor/ui` where there is
>   some, both skins, unit tests, the skins app (and the gallery) with gate checks and axe.
> - **Environment, 2026-10-10 evening:** Vitest got slow on this machine (about a second idle per module; plain node
>   loads everything in 0.2 s; Git Bash starts node in 1.2 s, PowerShell in 45 ms), so a full `pnpm test` runs into
>   5 s timeouts. Logically green (2002 passed with long timeouts). Look at it again before trusting a red root run.
> - **Wave A done (2026-10-10/11):** Splitter (`a24e07a`), Toolbar (`df6cf56`), Slider (`3dcc604`), Calendar and
>   DatePicker (`044f8ac`; ISO date strings, the WAI-ARIA date grid, typed dates read in the locale's order),
>   FileUpload (`810da40`; `uploadTo(url)` over XHR for the progress), SortableList and the Bootstrap catch-up
>   (`bfcc3df`; pointer drag across a group and a keyboard way with announcements; Autocomplete, TreeView,
>   CheckboxGroup, SidebarNav in Bootstrap), the guides [guide-charts.md](guide-charts.md) and
>   [guide-live-data.md](guide-live-data.md) (`9848560`; `apps/skins` `/charts`: Chart.js through `@attach`, a
>   d3-hierarchy treemap in markup, server events through `observe` across reconnects). Each with unit tests and
>   skins-gate checks in Edge, Firefox and WebKit with both skins; findings L9–L12 in
>   design-library-completeness.md §7 (L12: async key handlers race the next key — queue them, claim keys at once).
> - **Next:** wave B ([design-library-completeness.md](design-library-completeness.md) §3: Overlay, TimePicker,
>   Hotkeys, Highlighter, Rating, ColorPicker, …), then `@tsazor/charts` (D-L2).
>   - **Environment:** Vitest is sometimes slow here (a single file's collect up to 80 s). A root run during a skin
>     rebuild fails at random (43 failures once): never rebuild a skin while tests or gates run.
>   - **Closed 2026-10-11:** a component's published `.d.ts` lists its public methods too (`ComponentMetadata.methods`
>     in the compiler; `@internal` in a method's JSDoc keeps a child component's hook out), and types a parameter
>     without an annotation by its literal initializer (L14).
>   - **Wave B so far:** Overlay (`24d47bf`); public methods in the declarations (`137bc13`); L13, the Bootstrap
>     components take `@attributes` like their Fluent twins (`46108c9`); TimePicker, Rating, RatingDisplay, Highlighter
>     (`76c9c15`); Hotkey, KeyCode, ColorPicker, ColorPickerInput and L15 (`InputBase.element`, `c7e802a`); Carousel,
>     Link, Image, ScrollToTop (`06a05da`); TextInput's `mask` and Overflow (`fb5a6bc`). **Every wave-B component is
>     done** (both skins, unit tests, skins-gate checks in Edge, Firefox and WebKit), and so is `@tsazor/charts`
>     (`b1cbdc6`; D-L2, docs/design-charts.md; L16 fixed on the way). **Waves A and B are complete** — the library part
>     of the 1.0 scope (D-L1). Not covered on purpose: MudBlazor's DateMask/RegexMask/BlockMask, overflowing child
>     content without `Items`, chart types beyond line/area/bar/donut/pie (Chart.js through `@attach`).
>   - **The `Async` suffix — decided 2026-10-11 (owner): it stays.** A method keeps Blazor's name in camelCase,
>     `Async` included; a method Tsazor adds gets it when it returns a Promise (design-principles.md point 3,
>     migration-practices.md). Renamed: Virtualize `refreshDataAsync`/`scrollToItemAsync`, DataGrid
>     `scrollToItemAsync`, Overlay `showAsync`/`closeAsync`, Wizard `goToStepAsync`. Carousel's `moveTo`/`next`/
>     `previous` stay (MudBlazor's names have no suffix). `AuthenticationStateProvider.getState()` is
>     `getAuthenticationStateAsync()` (owner, same day); the owner's `fluentcms-admin` WIP is renamed too.
>   - **2026-10-11/12 — dogfooding the owner's `fluentcms-admin` WIP (port-findings.md V/W), then R2:**
>     - `@tsazor/dotnet`: `attachJwtAuth` keeps a request's headers and logs out on the current token's 401;
>       `principalFromJwt` knows `nameid`, and a token without a name signs in (as .NET); `createUserAsync` for roles
>       from a profile; the cookie provider's `refresh()` (F10: the FluentCMS port signs in without a reload).
>     - `@tsazor/runtime` (owner): response interceptors unwind like .NET's handler chain (the one added last
>       first); `notifyAuthenticationStateChanged` takes a promise (Blazor's Task; Authorizing until it resolves).
>     - F16 (the starter's font), V2 (the tutorial names `@tsazor/dotnet`).
>     - **R2 done** ([design-release.md](design-release.md)): lockstep `1.0.0-next.N` (owner), prereleases only to a
>       local Verdaccio (owner). `pnpm registry` (port 4873, `~/.tsazor/registry`), `pnpm release:local`,
>       `pnpm release:version`, `pnpm rehearsal` (in CI's check job). **1.0.0-next.1** is in the local registry.
>       Next: let the owner's apps run on it. Last breaking change 2026-10-12 (9943032, the interceptor order);
>       BlazorHero's additions after it complete the library (see the freeze yardstick in port-fluentcms.md).
>   - **2026-10-12 — the second app port, BlazorHero** ([port-blazorhero.md](port-blazorhero.md)): MudBlazor →
>     `@tsazor/fluent`, against upstream's unchanged API (`apps/blazorhero`; the .NET 6 SDK and the clone in
>     `.backend/`, LocalDB). Phases 0 and 1 (the shell: sign-in, JWT with refresh, hub, navigation by permission,
>     dark mode, languages, logout dialog) done; `pnpm --filter blazorhero verify` (38 checks; not in `pnpm gates` or
>     CI yet — it needs LocalDB and the .NET 6 SDK). From it: `DialogService` (B6), `AppLayout` (B8), `TextInput`
>     slots (B9), `Menu` `labelContent` and toast actions (B10, B11), `SidebarNav` sections and `target` (B13, B15);
>     fixes B7, B14, B16–B19 (B19: `tokenOverrides` never reached `--fui-accent`/`--fui-brand-background`). The
>     skins gate now checks every CSS property of the packages' stylesheets (B17). Open for the owner: B2, B3, B12,
>     B20. **Phase 2 (the catalog) done the same day** (66 checks): brands in the browser, products paged, sorted and
>     searched on the server, dialogs, Excel export and import, a picture shrunk before the upload. From it:
>     `requestImageFileAsync` and InputFile's click/cancel with Blazor's InputFile E2E suite in the parity gate (B22),
>     Paginator `pageSizeOptions` (B23), the Autocomplete in forms (B26), `CascadingTypeToken` (B27), a sortKey-only
>     TemplateColumn (B28), the Fluent grid's header alignment (B25). **Done after the owner's go (same day):** B24
>     (Typography `as`) and **B29 — the library's own texts are localizable** (`tsazor.ui.*` keys in the app's
>     tables, English fallback, plurals by `Intl.PluralRules`, design-localization.md §4a). Next (owner,
>     2026-10-12): the fullstackhero React admin port (the target group's archetype; UI question open), BlazorHero's
>     phases 3–6 later where fullstackhero doesn't cover them.
>     Seen once, under load: the parity gate's `DynamicContent_AppendItemsWhileAtBottom_ViewportStaysStable`
>     (virtualize) failed in a full `pnpm gates edge` run ("should not converge to bottom after small append") and
>     passed 3/3 alone — a timing window in Virtualize to look at if it recurs.
>   - Lockfile: a new external dependency is staged without the owner's `fluentcms-admin` WIP: back up
>     `pnpm-lock.yaml` and `pnpm-workspace.yaml`, add `"!apps/fluentcms-admin"` to the workspace, `pnpm install
>     --lockfile-only --offline`, diff the result against HEAD (only the new packages), keep its LF line endings
>     (HEAD's blob has them), `git hash-object -w`, `git update-index --cacheinfo 100644,<hash>,pnpm-lock.yaml`, restore both files.
> - **F15 fixed (2026-10-10, from a dogfood report):** an `@if`'s narrowing reaches child content, slots,
>   templates and bind setters in `tsazor check`, as Razor's nullable analysis does (checked against a Razor class
>   library; the old note that C# drops it too was wrong). The shadow calls those functions in place (codegen
>   `deferred()`); real builds are unchanged. A lambda the author writes keeps TypeScript's rule. Tutorial lessons
>   "Child content" and "Page title" rewritten.
> - **Before that:** the port's admin and public parts are done. Open: F13, F16 (F15, F17 and F10 fixed since); track B candidates (upload
>   drop zone with progress, a sortable list). The freeze signal: phase 5 added one Blazor parity method and fixed
>   three small API types, so the API still moves, but by now in small corrections.

## CI: blocked by GitHub billing, not by the code

Since `06d18dc` GitHub doesn't start the jobs: *"The job was not started because recent account payments
have failed or your spending limit needs to be increased."* → **Owner action:** GitHub → Settings →
Billing & plans. After that, re-run the latest run (or push) to get a real CI result for everything since.

- **Cost (owner decision, 2026-10-07):** GitHub Actions came to about €5/day (34 runs that day, each with
  three Windows jobs). Since then:
  - a push or PR runs only the Ubuntu `check` job;
  - the Windows browser gates (`e2e`, `engines`) run **only when started by hand** (Actions → CI → Run
    workflow);
  - a newer push cancels the running check;
  - pushes are batched: at the end of a session or at a milestone, not after every commit.
- The last real CI failure (`341a4ee`) was a missing `pnpm api:update` (Fluent API); the next commit
  updated the snapshots, and `pnpm api:check` passes locally.
- Every commit since was gated locally: `pnpm -r --filter '!fluentcms-admin' build` and `… test`,
  `pnpm api:check`, and the browser gates below in **Edge, Firefox and WebKit**.

## What happened today (in order)

**Core**
- **Cascading type parameters** (Blazor's `[CascadingTypeParameter]`): `@attribute
  @CascadingTypeParameter("TGridItem")`. Columns take the grid's row type; `TProp` follows from a lambda's
  return type. The Blazor form is TZS021 with a mechanical fix (codemod covered). Decision A6 ("remove by
  hand") is obsolete.
- **`inferTypeArgument`** (new in `@tsazor/compiler`): one type-argument inference for the LSP and the
  tutorial's in-browser `tsazor check`. The tutorial's copy had lacked the lambda return type.
- **`Virtualize`** renders no wrapper element (Blazor parity), has `SpacerElement` (`tr` inside a
  `tbody`), and drops superseded `ItemsProvider` results. **Behavior change** for users who put class or
  style on it.
- **Type layer fixes:**
  - optional function types in `satisfies` are now parenthesized;
  - case-exact package component lookup (`tooltip` vs `Tooltip.tsazor` on Windows);
  - the "read as text" note no longer lands on lambdas.

**Component library** (both skins on `@tsazor/ui`)
- **`@tsazor/ui`:** `DataGridModel`, `GridSort`, `PaginationState`, the ItemsProvider contract, selection
  helpers. Earlier today: behaviors, `Toaster`, `tooltip`, `FieldState`.
- **Tier 1 complete in both skins, same parameters:**
  - DataGrid (QuickGrid shape) with `PropertyColumn`, `TemplateColumn`, `Paginator`, sorting, paging,
    selection, ItemsProvider and virtualization;
  - Dialog, Drawer, Menu/Dropdown, Tooltip, Popover, Toasts (`Toaster` + `ToastRegion`);
  - Form and all inputs, including `DateInput` (value: ISO string), `FileInput` and `FormField`;
  - Tabs, Accordion, Collapse, ListGroup, Progress, Skeleton, ButtonGroup, Navbar + `NavbarLink`, Stack,
    Grid, Divider, Typography, Card + `CardBody`/`CardTitle`.
- **Aliases so that both names work in both skins:** `Dialog`/`Modal`, `Menu`/`Dropdown`,
  `FluentForm`/`Form`.
- **Fluent API breaks** (pre-1.0, listed in the CHANGELOG):
  - `intent`/`appearance` instead of `appearance="primary"`, `color` and `variant`;
  - `ToastProvider` → `ToastRegion`;
  - `Pagination` `pageCount`/`onPageChanged`;
  - the DataGrid `columns` array → column components.
- **Bootstrap fixes:**
  - `class` on a component no longer replaces its classes (`withClass`);
  - the Spinner now has a real status region (`text` → `label`);
  - `AccordionItem` renders `aria-expanded` as `"true"`/`"false"`;
  - Pagination buttons have `type="button"`, labels and `aria-current`.
- **Fluent contrast fix:** light-theme amber ink `#9C4D04`, and disabled list rows stay readable.

**Apps**
- **`apps/skins`:** the same pages built with both skins (Vite alias + stylesheet), with a link to the
  same page in the other build. Its gate runs 30 checks per skin (axe + behavior by role/label), also in
  CI.
- **Gallery:** new pages `/overlays`, `/structure`, `/more`, and the new DataGrid on `/datagrid`.
- **Demo:** `/components` shows every Bootstrap component; `/virtualize` shows a virtualized DataGrid
  over 10,000 orders.
- **Gates:** the a11y gates wait for each page's `h1` before axe. An empty page had passed axe.

**Tutorial**
- **Heavy work:**
  - The client file is now `orders-client.ts` (it was easy to confuse with `orders.worker.ts`).
  - Lesson 1 opens on the worker module.
  - The workload takes about 3 s on any machine (blocking checks per batch of 1,000 orders).
- **Playground `/playground`:** a free project with add/rename/delete of files, Reset, and "Playground"
  on every lesson. No saving yet.
- **Chapter "Component library"** (Part 3, chapter 06; Testing/Localization/Next steps moved to 07–09):
  - four lessons on `@tsazor/bootstrap`, each with a Blazor track;
  - lesson 1 says a library is an option — vanilla Tsazor works, and any library plugs in the same way;
  - the preview adds Bootstrap's CSS for lessons that import the package.

## Decisions taken today (also in memory)

- **The component library stays open for third parties; there are no "official" libraries.**
  - `@tsazor/ui` is the toolkit for every library author.
  - The two skins keep their `@tsazor/*` names and are reference implementations.
  - They move to their own repo at 1.0.
  - Until then, "leave it as it is": the rest is a matter of public APIs and communication.
- **Release model** (recommended, not yet decided in detail): lockstep `0.x` until 1.0; after 1.0, the
  library packages get their own versions with peer ranges on the runtime.
- **The DataGrid `Table` API differs between the skins** and stays skin-specific for now. The DataGrid
  is the shared path.

## Next steps

0. **Test as much as possible locally — done 2026-10-08.**
   - WSL Ubuntu-24.04 has Node 22.23.3 and pnpm 10.34.5 in `~/.local` (user space, no sudo).
   - **`pnpm ci:local [ref]`** (`scripts/ci-local.sh`, on Windows via WSL): CI's check job on a fresh clone
     in `~/tsazor-ci`. The steps come from the commit's own `ci.yml`. It takes about 130 s and was green for
     `7de26b8`.
   - **`pnpm gates [edge|firefox|webkit] [--only app,…] [--skip-build]`** (`scripts/gates.mjs`, Windows):
     every browser gate of CI's `e2e` and `engines` jobs, with a summary at the end. It fails when its list
     no longer matches `ci.yml`. All 27 were green for `7de26b8`, in about 12 minutes.
   - The check job is pinned to `ubuntu-24.04`, the same as WSL; `ubuntu-latest` becomes 26 on 2026-10-19.
   - **All of CI runs only by hand now** (owner, 2026-10-08): the repo stays private until it is mature,
     every minute costs, and the local checks run automatically. Start CI before a merge to main or a release.
1. **R3 `npm create tsazor` — done 2026-10-08** ([design-create-tsazor.md](design-create-tsazor.md), D-N1–D-N4).
   - The package `create-tsazor` writes the shape of `dotnet new blazorwasm`.
   - `--ui` takes any library through its `tsazor.setup` ([component-libraries.md](component-libraries.md)).
   - Tested by the tarball smoke (CI check job) and the `starter` gate (three engines, three variants).
   - Found and fixed on the way:
     - `NavLink` takes `class` and other attributes (Blazor parity);
     - the skins lacked `sideEffects` (the starter app's bundle went from 66.7 to 30.7 KB gz).
   - All 30 gates and `ci:local` were green for `5fa9c3d`.
2. **Release preparation (R2/E3/E10)**. Decided by the owner on 2026-10-08:
   - E12 and Sleipnir come after 1.0;
   - the repo stays private until 1.0;
   - the npm org `tsazor` exists;
   - the GitHub org `tsazor` with an empty private repo `tsazor/tsazor` exists;
   - the release starts there with a curated first commit.

   Still open:
   - the version scheme (lockstep 0.x?);
   - the LTS policy;
   - the publish workflow (Trusted Publishing; provenance needs the public repo);
   - a rehearsal against a local Verdaccio registry;
   - which files go public.
3. **DataGrid extras:** a filter slot and density. Tier 2 after 1.0: resize/reorder, grouping, inline
   editing, export.
4. **A shared `Table` API for both skins**, or document it as skin-specific.
5. **A CI check that the skins use only public API**, for when the topic "openness" comes back.

## Known follow-ups

- **Vite dev server on Windows:** it twice missed changes to `packages/*/dist` and served stale files.
  Restart with `--force`. This could hit anyone developing a library in a monorepo, so it is a DX
  candidate.
- **`@page` inside markup text** (`Page @page of 7`) is read as the directive. Rename the field; check
  Razor's behavior for parity.
- **The tutorial test files have 126 pre-existing TypeScript errors.** They are not type-checked in the
  build (unchanged today).
- **The reference page shows `Intent`** instead of the listed values. The `@tsazor/worker` package has an
  unused `happy-dom` devDependency.
- **`apps/fluentcms-admin`** (the owner's untracked WIP) fails `pnpm -r build`. Excluded from the runs,
  never touched.

## Working notes

- **`pnpm-lock.yaml` contains the owner's uncommitted WIP.** Stage only your own importer blocks: run
  `node stage-lock.cjs <importer> <out>` (the scratchpad script), then `git hash-object -w` +
  `git update-index --cacheinfo`.
- **Dev servers started today** (hidden processes; stop with `taskkill /T` on the port's PID):

  | Port | App |
  |---|---|
  | 5330 | tutorial |
  | 5321 | gallery |
  | 5322 | demo |
  | 5323 | skins, Bootstrap build |
  | 5324 | skins, Fluent build |

- **Gates:** `pnpm gates` runs all of them in all three engines; one at a time:
  - `pnpm --filter tutorial test` and `… verify`
  - `pnpm --filter gallery verify` and `… verify:a11y`
  - `pnpm --filter demo verify:a11y`
  - `pnpm --filter skins verify`

  `TSAZOR_BROWSER=firefox|webkit` runs them in the other engines.
