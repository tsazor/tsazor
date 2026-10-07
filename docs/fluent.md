# `@tsazor/fluent` — the Fluent 2 component library

A Fluent-2 design system for Tsazor, written entirely in `.tsazor`: token-driven,
accessible, and shipped as **your own sources** — copy-in is a first-class mode,
never a wrapper over an external UI kit.

## Install

```bash
pnpm add @tsazor/fluent
```

Then, once in your entry file:

```ts
import "@tsazor/fluent/fluent.css";   // all --fui-* tokens + component chrome
```

`fluent.css` is opt-in (`exports["./fluent.css"]`), so the JS side of the
package loads cleanly in node/vitest without a CSS import trap.

## The Add-CLI — components belong to you

```bash
npx @tsazor/fluent list
npx @tsazor/fluent add Dialog
npx @tsazor/fluent add ToastRegion --root apps/my-app --print
```

Copy-in mode writes `src/components/<Name>.tsazor` (+ sidecar CSS) plus every
sibling component the markup needs, and the token files once into
`src/styles/`. `--print` shows the plan dry-run, `--overwrite` replaces. The
CLI never edits your files; it prints the next steps.

Copied and npm-shipped components coexist: all classes are globally unique
(`fui-<block>__<element>--<modifier>`) and the dist build ships the same
sources the CLI copies (unscoped), so your vite-plugin's CSS isolation on
copied files is harmless for class matching.

## Tokens

All styling hangs off CSS custom properties (`--fui-*`), defined in four
blocks:

| Block | Selector | Purpose |
|---|---|---|
| Light (default) | `:root` | the Fluent 2 light palette |
| Dark explicit | `[data-fluent-theme="dark"]` | toggled via `ThemeState`/provider |
| Dark OS | `@media (prefers-color-scheme: dark)` behind `:root:not([data-fluent-theme])` | follow the OS until pinned |
| Compact density | `[data-fluent-density="compact"]` | tighter spacing/heights |

Sets include: brand ramp, neutral ramp + semantic surfaces
(`--fui-background-1..5`, `--fui-foreground-1..3`, strokes), status colors,
control fills/strokes, radii, a 4px spacing grid, the Segoe UI stack + type
ramp, elevation shadows 2–28, motion durations/easings and control heights
(s24/m32/l40).

`FluentProvider` accepts single-token `tokenOverrides` (`{ "--fui-radius-md": "12px" }`)
rendered as inline `--fui-*` styles over its subtree — the MudBlazor token
override model.

## Components (launch set)

Provider + 25: `FluentProvider`, `Button`, `Card`/`CardHeader`/`CardFooter`,
`Divider`, `Badge`, `Spinner`, `TextInput`, `TextArea`, `NumberInput`,
`Checkbox`, `Switch`, `Select`, `FluentForm`, `Tabs`/`Tab`, `Dialog`,
`Toast` + `ToastRegion`, `Table`, `DataGrid`, `SidebarNav`,
plus the W1 fill: `Stack`, `Grid`, `Spacer`, `Typography`, `Icon`, `Indicator`,
`Alert`, `Breadcrumb` + `BreadcrumbItem`, `Pagination`.

Every component takes `additionalAttributes` (`@attributes` /
`captureUnmatchedValues`) — anything the library does not declare is forwarded
to the root element (the `withAttributes` merge: `class` appends, the rest
overwrites; `aria-*` and `data-*` land where they belong). All enum-like
parameters are string-literal unions in the vocabulary both skins share
(`@tsazor/ui`, design-component-library.md §3): `intent` (`primary | secondary |
success | danger | warning | info | neutral` — primary is the brand color,
secondary/neutral the gray palette, primary reads as info on status surfaces),
`appearance` (`solid | outline | subtle | transparent`), `size` (`small | medium |
large`); Fluent-only extras stay on top (`shape`, the spacing scale
`"xs" | "s" | "m" | "l" | "xl"`).
Members stay camelCase; markup may write PascalCase attributes — the compiler
matches case-insensitively (the PascalCase decision, roadmap 4.2).

Notes on the important ones:

- **Button**: `intent` (default `secondary`, Fluent's neutral button; `primary` is
  the brand button) and `appearance` (default `solid`); renders
  `aria-label`/`aria-describedby` (`ariaLabel`, `ariaDescribedBy`) onto the native button.

- **Layout primitives**: `Stack` (flex axis + token gap), `Grid` (fixed
  `columns` or responsive `minChildWidth` minmax tracks — CSS grid, no JS),
  `Spacer` (token spacing scale, axis-aware). Dynamic flex/grid values ride
  inline styles; everything visual stays in `--fui-*`.
- **Typography**: `variant` picks both the semantic element (`h1…h5`, `body`,
  `caption`) and the token type class; `weight` is a token alias
  (`--fui-font-weight-*`).
- **Icon**: a small inline-SVG path set (`chevron-*, close, check, arrow-*,
  search, add, remove`), no icon package. `aria-hidden="true"` by default;
  pass `ariaLabel` for `role="img"`.
- **Indicator**: semantic dot or status chip (`intent`, default neutral); `visible` is false-or-nothing semantics.
- **Alert**: `intent` (default `info`),
  `dismissible`, `onDismissed`, `role="alert"`.
- **Breadcrumb/BreadcrumbItem**: item slots, `aria-label="breadcrumb"`,
  items with `active` render linkless with `aria-current="page"`.
- **Pagination**: controlled — `page` + `pageCount` + `onPageChanged`, the
  component keeps no page state. First/Prev/Next/Last + a ±2 number window
  with edge ellipses; all buttons carry `aria-label`s, the `nav` landmark
  takes `ariaLabel` (default `"Pagination"`).

- **Inputs** extend the runtime's `InputBase`: `@bind`, `fieldClass` and the
  EditContext validation messages come from core; only the Fluent chrome is
  here. Every input generates a unique `id` when the app gives none
  (`fui-input-3` …), so `label[for]` and `aria-describedby` always connect
  without the author wiring `id` strings. `aria-invalid` and
  `aria-describedby` render as soon as there is a message; the
  `role="alert"` message row appears with the first submit attempt only
  (documented deviation from Blazor, whose field classes go live immediately —
  the fluent `--invalid` classes still track every edit live).
- **FluentForm** wraps the runtime `EditForm` (`Model`, `Validators`,
  `onValidSubmit` + `onInvalidSubmit` — fluent marks the submit attempt so the
  field rows know) and renders `class="fui-form"`; put a
  `<Button type="submit" intent="primary">` inside.
- **Tabs/Tab**: `Tab` panels self-register against the `FluentTabs` cascade;
  roving tabindex, Arrow/Home/End keyboard nav (`rovingFocus` from `@tsazor/ui`),
  generated tab/panel ids, `onSelected`.
- **Dialog**: in-place fixed overlay on the `@tsazor/ui` behaviors — focus trap
  (Tab/Shift+Tab), Escape and backdrop dismissal for the top dialog only (nested
  dialogs close one at a time), body scroll lock and focus restore.
- **ToastRegion/Toast**: the app's toasts are the `Toaster` service (`@tsazor/ui`,
  re-exported): register it (`services.registerType(Toaster, { singleton: true })`),
  inject it anywhere and call `show({ title, message, intent, timeout })`; one
  `ToastRegion` (`position`: top/bottom-start/end) shows them, pausing while the
  pointer or focus is on a toast. Danger toasts announce as `role="alert"`, inside an
  `aria-live="polite"` region. `Toast` alone is one toast you place yourself.
- **Table**: generic via `@typeparam TRow`; you own filter/sort/paging and pass
  `items` + `headerContent` + `rowContent`
  (`(row: TRow) => RenderFragment` — the 2.4 templated-component standard; see
  the gallery's orders page).
- **DataGrid** (4.2): the opinionated sibling — you own the columns, the grid
  builds the table. `columns: DataGridColumn<TRow>[]` (`field`, optional
  `title`, `format` for the cell text, `align` `"start" | "center" | "end"`)
  produce header and body; per-cell escape hatch via `cellContent`
  (`(row, column) => RenderFragment`, e.g. link rows). `striped`, `hover`,
  `compact`, `emptyText`. A column without `title` shows the field name.
- **SidebarNav**: wraps runtime `NavLink` (`aria-current="page"` on the active
  link for free from the router).

Deferred (roadmap, not launch): Tooltip/Popover, Autocomplete, DatePicker,
Menu/Popup, grid virtualization, custom listbox (v1 `Select` is a native).

## Verification

- `packages/fluent/test/*.test.ts` — 65 unit tests against the compiled dist
  (all 10 W1 files covered, ≥2 each; datagrid tests build header, align,
  cell template, empty state and capture through the compiled dist).
- `apps/gallery` — the 14-route gallery + admin dashboard (`/primitives`
  showcases the W1 components; `/datagrid` the 4.2 DataGrid);
  `node scripts/verify.mjs` drives the live app (tokens light/dark,
  bind round-trip, form submit flow, tabs keyboard nav, dialog trap/escape/
  scroll-lock, orders filter/sort/paging, datagrid from the column list,
  toast lifecycle, aria-current, zero console errors).
- Root `pnpm test` runs every package project (runtime, compiler, workspace,
  lsp, testing, vite-plugin, fluent, components) — 289/289 green; the
  deprecated `vitest.workspace.ts` migrated to `test.projects` in
  `vitest.config.mts`.