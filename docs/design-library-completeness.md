# Design: a complete component library

Status: **decided** (owner, 2026-10-09; §6), work starts with the core (§5). This follows
[design-component-library.md](design-component-library.md), whose §4 put Tier 2 after 1.0.

## 1. Why

The owner, after the first dogfood assessment of a new app (AgentView, 2026-10-09): "A complete component library is
important, otherwise you always hit a wall." And: "Without a complete library, nobody will move to Tsazor."

The work has two purposes, as track B of the FluentCMS port had:
- **The components themselves.** A Blazor team compares the library with MudBlazor or Fluent UI Blazor before it
  moves.
- **The core.** Building complex components finds core bugs and gaps. Each becomes a fix with a test, as in the
  ports. Findings get IDs (L1, L2, …) in this document.

AgentView is the first app built new on Tsazor rather than ported. A port finds where Tsazor deviates from the
original. A new app finds what is missing, because no Blazor original shows the way. Its views asked for components
at once:

| View | Needs | Missing |
|---|---|---|
| Roadmap (phases → gates, evidence) | Stepper, Progress, Accordion, Markdown | Stepper, Markdown |
| Branch map | SVG lanes, Tooltip, Popover | none (own SVG component) |
| Approval inbox | list or DataGrid, Dialog, Markdown, a diff view | Markdown, diff view |
| Quality | a coverage line chart, a treemap | charts (out by design; the promised guide is missing) |
| Decision log | Timeline | Timeline |
| Live event feed | a list with rows of different heights that sticks to the bottom, icons | Virtualize (core), own icons (F17) |
| Chat | the same list, Markdown with code blocks, Avatar | Avatar, Markdown |
| Everywhere | own icons, panes (chat beside the main view), Toolbar, Chips for filters | Icons, Splitter, Toolbar, Chip |

With Tier 2 "after 1.0", every app finds these gaps one by one. Completeness is measured against a reference
instead.

## 2. The reference

- **Fluent UI Blazor** (`microsoft/fluentui-blazor`, `src/Core/Components` on main, 2026-10-09): the model for
  `@tsazor/fluent`, and what a Blazor team using Fluent knows.
- **MudBlazor** (`src/MudBlazor/Components`): the breadth Blazor teams expect from a library.
- **Bootstrap 5.3**'s components for `@tsazor/bootstrap`.

Radzen (charts, scheduler, HTML editor, pivot grid) is a suite. It is not the target.

## 3. Inventory

**In both skins (Tier 1, done):** Accordion, Alert, Badge, Breadcrumb, Button, ButtonGroup, Card, Checkbox, Collapse,
DataGrid (PropertyColumn, TemplateColumn, Paginator, Virtualize), DateInput (native), Dialog, Divider, Drawer,
FileInput, Form, FormField, Grid, Icon (since 2026-10-09; the full sets, see the Icons row), ListGroup, Menu/Dropdown, Navbar, NumberInput, Pagination, Popover, Progress,
RadioGroup, Select, Skeleton, Spinner, Stack, Switch, Table, Tabs, TextArea, TextInput, Toast, Tooltip, Typography.

**Only in `@tsazor/fluent`:** Autocomplete, CheckboxGroup, Indicator, SidebarNav, Spacer, TreeView. Bootstrap lacks
these.

**In neither skin:**

| Component | Fluent UI Blazor | MudBlazor | Wave |
|---|---|---|---|
| Icons: a full set plus an app's own (F17; done 2026-10-10) | Icons (Fluent System Icons, typed, tree-shaken) | Icon (Material) | A |
| Markdown (sanitized; `@tsazor/markdown`, done 2026-10-10) | none | separate package | A |
| Avatar (done 2026-10-10) | Avatar | Avatar | A |
| Chip / ChipSet (done 2026-10-10) | none | Chip, ChipSet | A |
| Timeline (done 2026-10-10) | none | Timeline | A |
| Stepper / Wizard (Wizard, done 2026-10-10) | Wizard | Stepper | A |
| Splitter (done 2026-10-10) | Splitter | SplitPanel | A |
| Toolbar (done 2026-10-10) | none on main (v4: Toolbar) | ToolBar | A |
| Slider | Slider | Slider | A |
| DatePicker with a calendar popup | DateTime | DatePicker | A |
| Upload drop zone with progress | InputFile | FileUpload, DropZone | A |
| Sortable list (drag and drop, with a keyboard way) | SortableList, Drag | DropZone | A |
| Overlay (busy state) | Overlay | Overlay | B |
| TimePicker | DateTime | TimePicker | B |
| Hotkeys | KeyCode | Hotkey | B |
| Highlighter | Highlighter | Highlighter | B |
| Rating | RatingDisplay | Rating | B |
| ColorPicker | ColorPicker | ColorPicker | B |
| Carousel | none | Carousel | B |
| Overflow | Overflow | none | B |
| Link, Image, ScrollToTop, input Mask | partly | yes | B |
| Charts | none | Chart (line, bar, pie, donut) | decision D-L2 |
| PullToRefresh, Emoji | yes | none | not planned |

The rich text editor stays in the app (the FluentCMS port embeds Quill), as in both references.

## 4. Outside the library

- **Core:** Virtualize at Blazor 11 parity ([design-virtualize.md](design-virtualize.md)):
  - measured item sizes;
  - generic `TItem`, so the context is typed;
  - `ItemContent`, `Placeholder` and `EmptyContent`;
  - `OverscanCount` and `MaxItemCount`.

  Sticking to the bottom for feeds and chats is Blazor 11's `AnchorMode.End`, so it is parity too.
- **Live data:** a guide to `EventSource` through `observe`, with reconnect and `Last-Event-ID`. The Sleipnir
  binding comes after 1.0.
- **Docs:**
  - the guide to integrating a chart library through `@attach`, promised in design-component-library.md;
  - the pattern for an app's own SVG visualization, e.g. a treemap with `d3-hierarchy`.

## 5. Waves

Both waves come before 1.0 (D-L1). The waves set the order, not the release:
- **A:** what a business app reaches for in its first week (AgentView, FluentCMS, the owner's company admin). That is
  the twelve wave-A rows above, plus the Bootstrap catch-up (Autocomplete, TreeView, CheckboxGroup, SidebarNav; Icon is done).
- **B:** the rest of the table, and `@tsazor/charts` (D-L2).
- **Order:**
  1. the core (Virtualize);
  2. Icons ([design-icons.md](design-icons.md)) and Markdown (every app hits them first);
  3. the rest of wave A;
  4. wave B.
- **Every component** gets its behavior in `@tsazor/ui` (keyboard tests once), a gallery page per skin, axe, and
  component docs ([design-component-library.md](design-component-library.md) §6).

## 6. Decisions needed

| # | Question | Decision (owner, 2026-10-09) |
|---|---|---|
| D-L1 | How much of the library before 1.0? | **Waves A and B.** 1.0 waits for the library |
| D-L2 | Charts | The `@attach` guide in wave A; `@tsazor/charts` in wave B (SVG line, bar, area, donut, sparkline in the skins' tokens), the breadth MudBlazor ships |
| D-L3 | Markdown | `@tsazor/markdown`: a `Markdown` component on `marked` and DOMPurify, sanitized by default. An app that shows an agent's or a user's text must not need to know about XSS |
| D-L4 | Both skins at once? | Yes, per component, as in Tier 1. The behavior lives in the core, so the second skin is markup and CSS |
| D-L5 | Icons | `Icon` takes any icon value (an app's own SVG). Generated packages with the full sets, tree-shaken: Fluent System Icons for Fluent, Bootstrap Icons for Bootstrap (as recommended; the owner didn't object) |

## 7. Findings

Core and component gaps found while building the library (§1). Each is fixed with a test.

| # | Where | Found | Fix |
|---|---|---|---|
| L1 | `@tsazor/fluent`, `withAttributes` | Icons step 4: `class="@(open ? "x" : null)"` on a component replaced its own classes (`fui-icon` was gone) instead of adding nothing | A missing class keeps the component's own (2026-10-10; `test/icon-slots.test.ts`) |
| L2 | `TextInput`, `TextArea` (both skins) | The icon browser's search: the value updated only on `change`. Fluent UI Blazor's inputs take `Immediate` and `ImmediateDelay` | `immediate` and `immediateDelay` (200 ms), the behavior `ImmediateInput` in `@tsazor/ui`: one update when the typing pauses, carrying the field's value then (2026-10-10). `NumberInput` doesn't have it yet |
| L3 | `npx @tsazor/fluent add` (copy-in) | Icons step 4 added `core-icons.ts`; a dry run showed that a copied component never brought the modules it imports (`attributes.ts`, `vocabulary.ts`, `./Menu.tsazor` types), only the sibling tags of its markup | The CLI follows relative imports too, of components and helpers alike (2026-10-10; `test/copy-in.test.ts` copies every component and resolves its imports) |
| L4 | `icon()` (`@tsazor/ui`) | Icons step 6, FluentCMS's own set: most of its SVGs say `fill="none" stroke="currentColor"` on the root. `icon()` kept only the viewBox and the inner markup, so under the skins' `fill="currentColor"` the outlines were drawn filled. And its `width` lookup matched `stroke-width` | The root's fill and stroke attributes move onto a `<g>` around the content; attributes are matched as whole names (2026-10-10; `packages/ui/test/icons.test.ts`) |
| L5 | Tests of sanitized HTML | `@tsazor/markdown`'s first tests: under happy-dom (the environment of the skins' tests and of `@tsazor/testing`'s examples) DOMPurify keeps `onerror` and drops `<p>`, so a test sees unsanitized HTML; happy-dom also fetched an `<iframe>`'s URL and ran the `onerror` | The package tests under jsdom, and the skins app's gate checks the sanitizing in Edge, Firefox and WebKit (2026-10-10). An app that tests its own Markdown output needs jsdom too (README) |
| L6 | `@tsazor/markdown`, accessibility | axe on the skins app's Content page: a task list's checkboxes had no name, and Bootstrap's pink inline code fell to 4.26:1 on the code background | The checkbox is named by its item's text; inline code takes the text color (2026-10-10) |
| L7 | The skins' builds | Rebuilding a skin while a dev server ran (the owner's gallery and skins servers, mine): the build removed `dist/` first, the server read the missing files in the gap, cached the errors and lost track of the new files, so it served the old skin until a restart | The builds overwrite `dist/` in place and remove only what they didn't write (2026-10-10); a running dev server picks a rebuild up |
| L8 | `@tsazor/fluent`'s copy-in CLI | Moving the CLI's closure into a module for a faster test: the package had no `bin` and its `files` left `bin/` out, so `npx @tsazor/fluent add`, as the README says, had nothing to run from npm | `"bin": { "tsazor-fluent": "./bin/fluent.mjs" }` and `bin` in `files` (2026-10-10); the tarball smoke checks the packed CLI |
