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
> - **Next:** the port's admin and public parts are done. Open: F10, F13, F15, F16, F17; track B candidates (upload
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
