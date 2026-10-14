# Design draft — the component library: one core, two skins

Status: **accepted** (2026-10-07; D-C1…D-C7 as recommended, see §8). Direction decided by the user on 2026-10-06: **one behavior
core, two skins** — Bootstrap 5 and Fluent 2 — with Bootstrap first, because every
`dotnet new blazor` template ships Bootstrap and migration starts there. This document turns the
direction into a package cut, a shared vocabulary, a 1.0 scope and an order of work; the
decisions it needs are listed at the end.

Why it matters: Tsazor's primary audience — Blazor teams — judges a framework by its component
library as much as by the framework (MudBlazor, Radzen, Blazorise, Fluent UI Blazor). Without
one, Tsazor looks bare.

---

## 1. Where we are (inventory, 2026-10-06)

Two packages grew separately:

| | `@tsazor/components` (Bootstrap 5) | `@tsazor/fluent` (Fluent 2) |
|---|---|---|
| Components | 25 | 33 |
| Distribution | npm | npm **and** copy-in (`npx @tsazor/fluent add Dialog`) |
| Parameter types | plain `string` (`variant: string`) | literal unions (`appearance: "primary" \| …`) |
| Attribute splatting | no | `additionalAttributes` everywhere |
| Form inputs (`InputBase`, `EditContext`) | none | TextInput, TextArea, NumberInput, Select, Checkbox, Switch, FluentForm |
| Data | Table (markup only) | Table\<TRow\> (templated), DataGrid\<TRow\> (columns) |
| Feedback | Alert, Badge, Spinner, Progress | Alert, Badge, Spinner, Toast + ToastProvider, Indicator |
| Overlays | Modal (no focus trap, no Escape) | Dialog (focus trap, Escape, restore) |
| Navigation | Breadcrumb, Navbar, Pagination, Tabs, Dropdown, ListGroup | Breadcrumb, SidebarNav, Pagination, Tabs (roving tabindex) |
| Layout | Card, Collapse, Accordion | Card, Stack, Grid, Spacer, Divider, Typography, FluentProvider (theme) |
| a11y gates | axe in CI; keyboard patterns open (E9) | axe in CI, dialog + tabs keyboard tests |

The same idea has different names and parameters: `Modal`/`Dialog`, `variant`/`appearance`
+ `color`, `onPageChanged` + `pageCount`/`onPageChange` + `totalPages`, `onSelect`/`onSelected`.
Behavior (focus trap, Escape, roving tabindex, ids) exists once, in Fluent's markup; Bootstrap
has almost none. That is the gap "one core" closes.

## 2. Target architecture

```
@tsazor/ui            behavior core: no markup styling, no CSS
  behaviors/          attachments: focusTrap, dismissible (Escape, click outside),
                      rovingFocus, anchoredPosition, typeahead, scrollLock
  state/              headless models: DialogState, DisclosureState, TabsState,
                      SelectionModel, DataGridModel (sort, filter, page, select)
  forms/              FieldBase (label, ids, aria-describedby, validation state on InputBase)
  vocabulary.ts       shared types: Intent, Size, Placement, …
@tsazor/bootstrap     Bootstrap 5 skin (today's @tsazor/components, renamed)
@tsazor/fluent        Fluent 2 skin (today's package; npm + copy-in)
```

- **Behaviors are attachments.** F2's `@attach` is exactly the shape a headless behavior needs:
  `<div @attach="focusTrap" @attach:dismiss="dismissible({ onDismiss: close })">`. The skins use
  them, and so can an app's own markup — the core is useful without either skin.
- **State models are plain classes**, testable without a DOM (`DataGridModel` sorts and pages
  arrays or calls an items provider). Skins render them.
- **Skins own markup and CSS only.** A component in a skin is a thin `.tsazor`: core state +
  core behaviors + the design system's classes. Copy-in (Fluent today) stays possible because a
  copied component imports the core from npm.
- **Zero runtime dependencies** stays the policy: no Popper/Floating UI; `anchoredPosition` is
  our own small positioning (flip + shift), enough for menus, tooltips and selects.

## 3. One vocabulary

The same component name and the same parameters in both skins, so switching the skin is a
change of `@using` (and CSS), not a rewrite. Skin-specific extras are allowed on top
(Fluent's `shape`, Bootstrap's `outline`), the shared part is not renamed.

| Concept | Shared name | Notes |
|---|---|---|
| Intent / color | `intent: "primary" \| "secondary" \| "success" \| "danger" \| "warning" \| "info" \| "neutral"` | Bootstrap maps 1:1; Fluent maps to brand/status colors |
| Visual weight | `appearance: "solid" \| "outline" \| "subtle" \| "transparent"` | Bootstrap `outline` → `appearance="outline"` |
| Size | `size: "small" \| "medium" \| "large"` | Bootstrap `sm`/`lg` |
| Overlay | `Dialog` (with `Modal` as an alias in the Bootstrap skin) | D-C3 |
| Two-way values | `@bind-Value` on every input (`InputBase` contract) | Blazor parity |
| Events | `onX` + past tense where Blazor does (`onClosed`, `onPageChanged`) | Blazor naming |
| Paging | `page`, `pageCount`, `onPageChanged` | |
| Attributes | `additionalAttributes` (captureUnmatchedValues) everywhere | Blazor parity |

Literal-union types everywhere (strict TS, completion in the editor).

## 4. Scope for 1.0

**Tier 1 — in 1.0, both skins** (status 2026-10-07: all in both skins, same parameters; the
DataGrid with sorting, paging, selection, an ItemsProvider and virtualization; filter slot and
density are open):

- Actions: Button, ButtonGroup, Dropdown/Menu (keyboard, typeahead), Tooltip
- Forms: TextInput, TextArea, NumberInput, Select, Checkbox, Switch, RadioGroup, DateInput
  (native), FileInput (wrapping `InputFile`), FormField (label, help, validation message),
  Form (EditForm with skin styling)
- Data: **DataGrid** (§5), Table, Pagination, ListGroup/List
- Feedback: Alert, Toast, Badge, Spinner, Progress, Skeleton
- Overlays: Dialog, Drawer (offcanvas), Popover
- Navigation: Tabs, Breadcrumb, Navbar/AppBar, SidebarNav (NavLink-based), Accordion/Collapse
- Layout: Card, Stack, Grid, Divider; theming (light/dark; Bootstrap `data-bs-theme`, Fluent
  tokens)

**Tier 2 — after 1.0** (superseded 2026-10-09: both waves of
[design-library-completeness.md](design-library-completeness.md) come before 1.0): Autocomplete/Combobox, DatePicker popup, TimePicker, TreeView,
Stepper, Carousel, Rating, Slider, ColorPicker, Avatar, Chip, Timeline, drag-and-drop upload.
Charts stay out (a chart library is its own product; document integrating one via `@attach`).

## 5. DataGrid — its own work package

The DataGrid decides whether business developers take the library seriously. Proposal: **model
it on Blazor's QuickGrid**, which every Blazor team can use today:

- `<DataGrid Items="…">` or `ItemsProvider="…"` (server-side paging/sorting, `CancellationToken`
  → `AbortSignal`), `<PropertyColumn Property="(o) => o.name" Sortable="true" />`,
  `<TemplateColumn>`, `<Paginator State="…" />`, `Virtualize="true"` (runtime `Virtualize`).
- Beyond QuickGrid (Tier 1): row selection (single/multi), column filter slot, sticky header,
  density, empty/loading templates. Tier 2: column resize/reorder, grouping, inline editing,
  export.
- `DataGridModel` lives in the core; both skins render it. A QuickGrid-shaped API also makes
  the codemod's job easy (QuickGrid markup → Tsazor DataGrid nearly 1:1).

## 6. Quality bar

- Every component: typed parameters, component doc (`@** … *@`, shows up in the reference),
  a gallery page per skin, axe in CI (exists for both), keyboard tests for every interactive
  component (in the core, once).
- Tutorial: a Part 2/3 chapter "Component library" (choose a skin, forms with the library, a
  DataGrid over the bakery's orders).
- `npm create tsazor --ui bootstrap|fluent|none` (R3) sets the skin up.

## 7. Order of work

1. **Core skeleton:** `@tsazor/ui` with the behaviors Dialog, Tabs and Dropdown need
   (focusTrap, dismissible, rovingFocus, anchoredPosition) — this closes the E9 keyboard gap.
2. **Bootstrap skin on the core:** rename `@tsazor/components` → `@tsazor/bootstrap`, adopt the
   vocabulary, add the missing form inputs (on `FieldBase`), Toast, Drawer, Tooltip.
3. **Fluent skin on the core:** move its behavior into the core, adopt the vocabulary.
4. **DataGrid** (QuickGrid-shaped) in core + both skins.
5. Rest of Tier 1, gallery pages, the tutorial chapter, R3 `--ui`.

## 8. Decisions needed

| # | Question | Decision (2026-10-07, as recommended) |
|---|---|---|
| D-C1 | Package cut | `@tsazor/ui` (core) + `@tsazor/bootstrap` + `@tsazor/fluent` |
| D-C2 | Rename `@tsazor/components` → `@tsazor/bootstrap` | yes (nothing is published yet; the name says what it is) |
| D-C3 | `Dialog` or `Modal` as the shared name | `Dialog` (MudBlazor, Radzen, Fluent UI Blazor, the HTML element); Bootstrap skin also exports `Modal` as an alias |
| D-C4 | Distribution | Bootstrap: npm; Fluent: npm + copy-in (as today); copy-in for Bootstrap later if asked for |
| D-C5 | DataGrid API | QuickGrid-shaped (parity + codemod), extended per §5 |
| D-C6 | Bootstrap CSS | not bundled: the app brings Bootstrap 5.3 (as every Blazor template does); the skin only emits classes |
| D-C7 | 1.0 scope | Tier 1 as in §4; widened 2026-10-09 to a complete library ([design-library-completeness.md](design-library-completeness.md)) |
