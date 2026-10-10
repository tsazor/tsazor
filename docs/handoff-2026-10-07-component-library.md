# Handoff: component library, core extensions, tutorial (status 2026-10-07, evening)

**Read first:** this document, then [roadmap-1.0.md](roadmap-1.0.md) and
[design-component-library.md](design-component-library.md). Branch `roadmap/phase-0`, HEAD `92f2b89`,
everything pushed.

> **Update 2026-10-08, evening — the main track is now the FluentCMS port: [port-fluentcms.md](port-fluentcms.md).**
> - **The decision:** quality isn't 1.0-ready yet; the API still moved a lot.
>   - Before R2/1.0, a real Blazor app is ported: FluentCMS's admin, with `@tsazor/fluent`.
>   - Every gap becomes a framework fix with a test.
>   - A week of porting without a public-API change is the signal for the freeze.
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
>   - Next: Markdown (`@tsazor/markdown`, D-L3), then the rest of wave A.
>   - **Open (found 2026-10-10):** a component's published `.d.ts` (`componentTypeDeclaration` in
>     `@tsazor/workspace`) lists its parameters only. `.tsazor` files see the methods through the source shadows
>     (`98f29b5` fixed that for Linux and macOS), but plain TypeScript (a code-behind `X.tsazor.ts`, a `.ts` helper)
>     that types a library component sees no `scrollToItem`/`refreshDataAsync`. The manifest needs the public
>     methods too.
>   - Lockfile: a new external dependency is staged as HEAD's `pnpm-lock.yaml` plus its importer block and its
>     `packages:` and `snapshots:` entries (written to a temp file, `git hash-object -w`, `git update-index
>     --cacheinfo`), so the owner's `fluentcms-admin` WIP stays out.
> - **F15 fixed (2026-10-10, from a dogfood report):** an `@if`'s narrowing reaches child content, slots,
>   templates and bind setters in `tsazor check`, as Razor's nullable analysis does (checked against a Razor class
>   library; the old note that C# drops it too was wrong). The shadow calls those functions in place (codegen
>   `deferred()`); real builds are unchanged. A lambda the author writes keeps TypeScript's rule. Tutorial lessons
>   "Child content" and "Page title" rewritten.
> - **Before that:** the port's admin and public parts are done. Open: F10, F13, F16 (F15 and F17 fixed since); track B candidates (upload
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
