# Design draft — the extended library: beyond the complete library

Status: **proposal** (owner direction, 2026-10-16: "an Extended library with components like
Radzen's — AI, Spreadsheet, Calendar, PivotDataGrid, AppTemplates and UI Blocks, and a really
good DataGrid"). This document turns the direction into clusters, a package cut, an order of
work and the decisions it needs (§9); D-X2 and the RichText2 wrapper's place in the library
(D-X9) are decided (owner, 2026-10-16), the rest are proposals. It builds on
[design-component-library.md](design-component-library.md) and
[design-library-completeness.md](design-library-completeness.md), whose waves A and B are done:
the complete library exists, and this is the layer above it.

Why it matters, twofold:

- **Positioning.** The complete library closes the "wall" gap — a Blazor team finds what its app
  needs. The extended library is the layer where Tsazor stops being at parity and starts pulling:
  a suite like Radzen's, on a modern stack, with strict TypeScript end to end. The completeness
  document says "Radzen is a suite; it is not the target" — that stays true for the base library
  (its reference is Fluent UI Blazor, MudBlazor, Bootstrap). **For this layer Radzen is the
  reference.**
- **The stress test.** The owner, 2026-10-16: "It is also a test for Tsazor." Each cluster stresses
  a different core muscle (§4). The gaps this work finds are fixed with tests, as in the ports and
  the library waves; they get IDs X1, X2, … (§8).

---

## 1. What the extension is not

- No editor engine: rich text is the owner's **RichText2** (own project, near release as of
  2026-10-16); Tsazor ships the wrapper component for it, not the engine (§2.7, D-X9). The
  completeness document's rule — an app embeds its editor — is superseded only by the wrapper.
- No charts work: `@tsazor/charts` exists (D-L2). Apps that need more integrate a chart library
  via `@attach` ([guide-charts.md](guide-charts.md)).
- No SDK coupling for AI: the library ships state and UI, never a provider, an API key or a
  network client for a model (D-X5).

## 2. The clusters

Six clusters; four follow the standing architecture (headless core in `@tsazor/ui`, markup in both
skins), two are packages of their own (D-X1).

### 2.1 DataGrid advanced — the backbone

The grid exists (QuickGrid-shaped: `PropertyColumn`/`TemplateColumn`, `Paginator`,
`ItemsProvider`, `Virtualize`, row selection, the column-options slot). What is still open from
design-component-library.md §4 alone: a built-in column filter and density. What goes beyond:

- **Grouping:** group rows by one or more columns, expand/collapse, group footers. No Blazor
  original (QuickGrid has none) — modeled on Radzen and MudBlazor's grid, kept QuickGrid-shaped
  where they overlap.
- **Column resize and reorder:** pointer and keyboard (resize handles with a `Handle` role, arrow
  keys); the state is the headless part, the handles are skin markup.
- **Inline editing:** cell and row edit modes, validation through `EditContext` (the input
  components already speak it), commit/cancel via Enter/Escape.
- **Aggregates:** per-column footer summaries (`sum`, `avg`, `count`, `min`, `max`, a custom one),
  computed over the current page or the whole source.
- **Column persistence:** a serializable snapshot (order, width, visibility, sort, filter) the app
  stores where it wants; no `localStorage` in the core.
- **Export:** CSV/TSV built in, dependency-free (D-X6); Excel export stays out unless asked for.
- The tier-1 leftovers: a built-in string/number/date filter UI and a `density` parameter.

### 2.2 Scheduler (the owner's "Calendar")

The `Calendar` component exists (month grid, single date picking). The Scheduler is the
appointment layer on top:

- Views: month, week, day (week and day as time columns; a resource timeline is not v1).
- An `Appointment` model (start, end, title, color/tone, all-day); recurrence is D-X3.
- Creating, moving and resizing an appointment with pointer **and keyboard** over the layers and
  the drag engine the `SortableList` behavior already proved (L12's queue).
- Detail popovers, an edit Dialog, an all-day row.

### 2.3 AI components

Provider-agnostic pieces for chat UIs, modeled on what chat frontends always need:

- `ChatState` (headless, in `@tsazor/ui`): messages, a streaming append the app feeds from its own
  `fetch`/SDK (`AbortSignal` for cancel), copy/rerun as actions on a message.
- `Chat`: the list with `Virtualize` pinned to the bottom (`AnchorMode.End` exists for exactly
  this), Markdown through `@tsazor/markdown` for messages, role avatars, a thinking indicator.
- `PromptInput`: auto-growing textarea, send on Enter, attach hooks — the composition of
  `TextArea` (`immediate`, L2) and actions the skins already have.

### 2.4 AppTemplates and UI blocks

The shadcn "blocks" model: section- and page-sized compositions an app copies in and then owns and
edits. Not runtime components — files (`templates/` in each skin package, delivered by copy-in):

- Blocks: a settings pane, an empty state, a CRUD page (DataGrid + Dialog + Form over the same
  model), a dashboard shell (Splitter + SidebarNav + Toolbar), an auth pair (login, register).
- Distribution: `npx @tsazor/fluent add AuthLogin` — the copy-in CLI already follows relative
  imports (L3), it gains a template directory; Bootstrap gets the same CLI (D-X8).

### 2.5 PivotDataGrid

On the DataGrid core, as Radzen's pivot is on its grid:

- `PivotModel<T>` (headless): row fields, column fields, a measure (aggregate: sum, avg, count,
  min, max, custom), totals per row/column; the pivot computes the matrix and renders it as grid
  rows the DataGrid can page and sort.
- Drill down: from a pivot cell into the underlying rows (a filtered DataGrid), not v1.

### 2.6 Spreadsheet

The heaviest cluster and the one with no Blazor counterpart at all (SyncFusion and DevExtreme's
domain, x-spreadsheet's and Univer's in TS land). A package of its own, `@tsazor/spreadsheet`, on
the precedent of `@tsazor/charts` (D-X1): a headless engine (sheet model, selection, an undo stack,
copy/paste) plus the rendered sheet. V1 scope: editing experience only — cells, ranges, keyboard
navigation, paste, undo, basic formatting (bold, align, number formats through
`@tsazor/primitives`). Formulas are D-X4 and come later, a project of their own like charts were.

### 2.7 Rich text — the RichText2 wrapper (owner decision, 2026-10-16)

- A `RichText` component in both skins: the wrapper the owner asked into the library. It mounts
  RichText2 over `@attach`, binds value two-way (`@bind-Value` in HTML as its value) and leaves
  the toolbar to RichText2, with the skins' chrome around it (Dialog, Popover, overflow).
- Dependency-free: the wrapper calls the editor through a one-method contract
  (`createEditor(element, options)`-shaped — value in, change events out; D-X9) and RichText2
  provides the factory. The app adds RichText2 to its `package.json` itself; the
  zero-dependency policy survives, and a different editor can serve behind the same contract.
- `value` is user-authored HTML, the classic XSS vector: sanitization on read by default, as
  `@tsazor/markdown` does it (D-L3), switchable off (D-X10). The wrapper's own chrome (toolbar,
  dialogs) meets the library's a11y bar; the editor surface itself stays RichText2's quality.
- The contract's exact shape is finalized once RichText2's API is read (it is near release).

## 3. Package cut

| Cluster | Core | Markup |
|---|---|---|
| DataGrid advanced | `@tsazor/ui` (`data-grid.ts`) | both skins |
| Scheduler | `@tsazor/ui` (model + behavior) | both skins (existing `Calendar` stays) |
| AI | `@tsazor/ui` (`ChatState`) | both skins |
| PivotDataGrid | `@tsazor/ui` (`pivot-data-grid.ts`) | both skins |
| Spreadsheet | `@tsazor/spreadsheet` (engine) | its own markup, themed by the skins' tokens (charts' model) |
| Templates and blocks | none — files | `templates/` in each skin package, copy-in |
| RichText2 wrapper | `@tsazor/ui` (the contract type, the bind) | both skins; the editor engine stays external (§2.7) |

No new architecture: the extended layer uses the cut of design-component-library.md D-C1 and the
vocabulary (§3 there) — same names in both skins, literal unions, `additionalAttributes`, the
gallery gets an "Extended" section per skin. Nothing about this layer special-cases the tooling.

## 4. The stress-test map

What each cluster exercises in the core; the failures surface as X-findings, fixed with tests:

| Cluster | Core muscles stressed |
|---|---|
| DataGrid advanced | the update storm (a sort/resize/edit touches every row), Virtualize under moving rows, measured widths, keyboard focus across hundreds of cells |
| Scheduler | layers composed (traps + dismissal, L11's lesson), drag-and-drop across overflow containers, async drag updates |
| AI | streaming — many small re-renders appended to a `Virtualize` list pinned to the end; Markdown into a live list; `AbortSignal` teardown |
| Templates and blocks | deep composition — cascading values, slots, forms over `EditContext`, `@key`s in nested trees, routed pages that are files an app then edits |
| PivotDataGrid | generics and lambda properties in .tsazor (`PivotModel<OrderRow, Product, Quarter>`), nested records in markup, sorting an aggregate |
| Spreadsheet | `Decimal` and the E12 primitives in an editing loop, virtualization at scale (10⁴+ cells), undo over `@bind` |
| RichText2 wrapper | an external imperative widget through Tsazor's lifecycle — teardown across re-renders, two-way sync while the editor mutates itself, focus across the boundary |

## 5. Order of work (proposal)

The dependencies set it; nothing of this layer blocks 1.0 (§7):

1. **DataGrid advanced** (§2.1) — the backbone; PivotDataGrid builds on it.
2. **RichText2 wrapper** (§2.7) — small, and an early lifecycle test; RichText2 is near release.
3. **Scheduler** (§2.2) — drag and layers on a proven engine.
4. **AI components** (§2.3) — streaming; reuses the Markdown and Virtualize lessons.
5. **Templates and blocks** (§2.4) — composition over every component above.
6. **PivotDataGrid** (§2.5).
7. **Spreadsheet** (§2.6) — its own package and engine, the long pole.

## 6. Quality bar

Per component as in the library waves: the headless behavior with keyboard tests in `@tsazor/ui`,
a gallery page per skin, axe in CI, component docs (`@** … *@` in the reference), an API snapshot
test. Templates: the copied files must pass `tsazor check` and the copied page must run — a
copy-in smoke test per template (L8's tarball check extends to them).

## 7. Relation to 1.0

The owner's 1.0 scope (2026-10-15): the complete library, the E12 primitives, BlazorHero phases
5 and 6, plus the FluentCMS port as the API-freeze signal. **This layer is post-1.0, developed
alongside** — the owner, 2026-10-16: two lines. Line one, 1.0, proceeds untouched on its own
schedule; this layer grows in its gaps and never slows 1.0. The door stays open: a cluster that
happens to be sufficiently stable when 1.0 ships can still appear at release, but that is not the
goal. D-X2 closes accordingly; DataGrid advanced is not pulled forward by default.

## 8. Findings

Core and component gaps found while building the extended layer. Each is fixed with a test.

| # | Where | Found | Fix |
|---|---|---|---|
| — | — | none yet | — |

## 9. Decisions needed

| # | Question | Proposal (owner decides) |
|---|---|---|
| D-X1 | Package cut | Clusters 2.1–2.4 in the existing packages; `@tsazor/spreadsheet` on the charts precedent (own package); templates as files in the skin packages. A separate `@tsazor/extended` package would be a second architecture next to the first — not proposed |
| D-X2 | What is in 1.0 | **Post-1.0, developed alongside (owner, 2026-10-16).** Two lines: 1.0 is not slowed; if a cluster is stable enough at release it may still ship, but that is not the goal |
| D-X3 | Scheduler recurrence | None in v1 (single-appointment model; recurring series later, with its own decision) |
| D-X4 | Spreadsheet v1 formulas | None in v1 (editing only), formulas as their own later package |
| D-X5 | AI provider contract | `ChatState` takes an app-supplied stream (`AsyncIterable`-shaped or event callbacks) and an `AbortSignal`; the library never opens a connection or holds a key |
| D-X6 | Grid export | CSV/TSV in the core, dependency-free; no xlsx dependency unless asked for |
| D-X7 | Findings prefix | X1, X2, … (L is the waves', E is the primitives') |
| D-X8 | Copy-in for Bootstrap | A `npx` CLI like Fluent's, at least for templates |
| D-X9 | The RichText2 wrapper in the library | **Yes (owner, 2026-10-16).** Dependency-free wrapper in both skins over a `createEditor`-shaped contract; RichText2 provides the factory, the app adds the engine |
| D-X10 | Rich text sanitization | `@tsazor/markdown`'s rule (D-L3): sanitize on read by default, switchable off; refined when RichText2's API is read |