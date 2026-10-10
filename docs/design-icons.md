# Design: icons (F17, wave A)

Status: **done** (all six steps of §4: 1–3 on 2026-10-09, 4–6 on 2026-10-10; F17 is closed). The first step of wave A in
[design-library-completeness.md](design-library-completeness.md) (D-L5: `Icon` takes any icon value; generated
packages with the full sets, tree-shaken).

## 1. Why

Every app hits icons first.
- **FluentCMS (F17):** the port needed about 22 icons; `@tsazor/fluent` has 16 built-in stroke icons, and an app
  can't bring its own.
- **AgentView (dogfood):** own icons in the event feed, the toolbar and the roadmap.
- A Blazor app ported from Fluent UI Blazor writes `Icons.Regular.Size20.Save` in dozens of places. Each needs a
  Tsazor equivalent, or the port stops.

## 2. What the Blazor libraries do

| Library | Icon values | Component | An app's own icon |
|---|---|---|---|
| Fluent UI Blazor | `Microsoft.FluentUI.AspNetCore.Components.Icons`: the Fluent System Icons as classes, `new Icons.Regular.Size24.Save()`; trimming drops the unused ones | `<FluentIcon Value="@(…)" Color="Color.Accent" Width="24px" />`; buttons take `IconStart`/`IconEnd` | `new Icon("MyIcon", IconVariant.Regular, IconSize.Size24, "<path d='…'/>")`, `Icon.FromImageUrl(url)` |
| MudBlazor | `Icons.Material.Filled.Add`: SVG markup strings (Material icons) | `<MudIcon Icon="@Icons.Material.Filled.Add" />` | any SVG string |
| Blazor Bootstrap | `IconName.Alarm` (an enum over the Bootstrap Icons font) | `<Icon Name="IconName.Alarm" />` | none (the font) |

## 3. Design

### 3.1 The value

`@tsazor/ui` (skin-neutral) defines what an icon is:

```ts
export interface IconValue {
  readonly name: string;      // "save", for titles and tests
  readonly viewBox: string;   // "0 0 20 20"
  readonly content: string;   // the SVG's inner markup: <path d="…"/>
}
export function icon(name: string, svg: string): IconValue; // an app's own: inner markup, or a whole <svg> (its viewBox is kept)
```

The skins render it as `<svg viewBox fill="currentColor">` with the content as markup. A whole `<svg>` given to
`icon()` keeps its root's fill and stroke attributes on a `<g>` around its content, so an outline icon
(`fill="none" stroke="currentColor"` on the root, as most hand-made sets write it) stays an outline (L4). The renderer already parses
markup inside `<svg>` in the SVG namespace, cached per string, under Trusted Types (`dom-renderer.ts`). Icon content
is trusted: it comes from a package or from the app's own code, never from user input.

### 3.2 The generated packages

| Package | Source (MIT) | Form |
|---|---|---|
| `@tsazor/fluent-icons` | `@fluentui/svg-icons` (about 2,000 icons × sizes 10–48 × regular/filled; 21,735 SVGs) | `Icons.Regular.Size20.Save`, `Icons.Filled.Size24.Delete` |
| `@tsazor/bootstrap-icons` | `bootstrap-icons` (2,078 icons, one size) | `Icons.Save`, `Icons.SaveFill`; a name that starts with a digit gets `Number` in front (`Icons.Number0Circle`) |

- **Tree-shaken:** one ES module per variant and size (`regular/size20.js` exports `Save`, `Delete`, …), joined by
  `export * as` namespaces. Rollup drops what a static access (`Icons.Regular.Size20.Save`) doesn't reach. A build
  test checks that a page using one icon ships only that one.
- **Generated at build time** from the MIT packages (devDependencies), not committed: about 14 MB of path data. The
  generator writes the `.js` and `.d.ts` of each module; each icon is `export const Save: IconValue`. The
  localized variants of the Fluent set (`icons/<language>/`) are left out for now. A generated package has no API
  snapshot (`"tsazor": { "apiSnapshot": false }`): the source set is its API, pinned by version.
- **Typed:** a typo is TS2339 on the namespace, with the usual hint.
- **The dev server** has no bundler: the namespace loads the whole set there. Measured in Edge against Vite
  (2026-10-10): about 1.1 s on the first page load, a single module (`regular/size20`) 0.17 s. So each variant and
  size is also its own entry point, `@tsazor/fluent-icons/regular/size20`, with the same values; an app that wants a
  lighter dev start imports that. A build is unaffected either way.
- **A module imported both ways** (statically by a page, dynamically by an icon browser) stays whole in the static
  chunk: Rollup can't drop the exports a dynamic import may reach. The skins app has both and pays for it (its main
  chunk holds one size of the Fluent set, all of Bootstrap's); an app without a browser keeps only its icons.
- **The Razor form** stays close to Fluent UI Blazor: `@import * as Icons from "@tsazor/fluent-icons"`, then
  `<Icon Value="@Icons.Regular.Size20.Save" />`. The codemod rewrites `new Icons.Regular.Size20.Save()` to
  `Icons.Regular.Size20.Save` (a class instance per use becomes a shared value; nothing else changes).

### 3.3 The components

- **`Icon`** (both skins) takes Fluent UI Blazor's `Value` (an `IconValue`; it wins over `name`), `Color` (any CSS
  color; default `currentColor`) and `Title` (the accessible name; without it the icon is decorative and
  `aria-hidden`). The size stays `size` in px (`Width="24px"` becomes `size="24"`); a click is `@onclick`.
  Without `size` a value is drawn at its own size, its viewBox width (`iconSize()`), as `FluentIcon` takes the
  icon's size: `Size20` is 20px, a Bootstrap icon 16px, a `name` 16px. `@tsazor/bootstrap` gets an `Icon` with the
  same parameters (done in step 1); it sits on the text's baseline (`vertical-align: -0.125em`, as
  bootstrap-icons.css sets `.bi`). Both skins export `icon()` and `IconValue`, so an app needs no other package for
  its own icons.
- The built-in stroke set (`name="close"`) stays for now, so nothing breaks. The skins' own components switch to
  the generated values of their own set, so a skin's icons look alike (done in step 4, D-I4): in Fluent, Alert's
  status icons (MessageBar's filled Info, CheckmarkCircle, Warning, DismissCircle), every close button (Dismiss),
  the pagers (ChevronDoubleLeft … ChevronDoubleRight), the grid's sort arrows (ArrowSort, ArrowSortUp,
  ArrowSortDown), the accordion's and the tree's chevrons (ChevronRight, turned while open); in Bootstrap, the
  grid's sort arrows (CaretUpFill, CaretDownFill, ArrowDownUp; its close buttons are Bootstrap's `.btn-close`).
  `name` is deprecated once nothing in the repo uses it (after step 6).
- **Icon slots** (done in step 4), as Fluent UI Blazor main names them:
  - `Button`, `MenuItem` (Bootstrap: `DropdownItem`), `Badge` and `NavbarLink` take `IconStart`/`IconEnd`. A
    Button without a label is icon-only (square in Fluent) and needs an `ariaLabel`. Badge draws its icons at 12px
    (10px when small in Fluent) and takes `IconLabel`.
  - `Tab` takes `IconStart`.
  - A `TreeViewItem` takes `iconStart`, `iconEnd`, `iconCollapsed` and `iconExpanded` (the last two replace the
    chevron in their state, e.g. a closed and an open folder).
  - `SidebarNav`'s links take `icon` and `iconActive` (main's `IconRest`/`IconActive`: the regular icon at rest,
    the filled one on the current page). The compact rail shows only the icon; the label stays the link's
    accessible name and becomes its tooltip.

## 4. Order

1. `IconValue` and `icon()` in `@tsazor/ui`; `Icon` with `Value` in both skins (an app's own icons work from here).
2. The generator and `@tsazor/fluent-icons`, with the tree-shaking build test.
3. `@tsazor/bootstrap-icons`.
4. The icon slots on the components; the skins' internal icons switch to the generated sets.
5. The gallery: an icon browser per skin (search, copy the Razor form). The codemod rule. Done: the browser is
   the skins app's Icons page (one page, the set of the build's skin; Fluent by variant and size), and the codemod
   rewrites `new Icons.X.Y.Z()` to `Icons.X.Y.Z` in markup.
6. FluentCMS: the port uses the original's icons (F17 closes). Done: FluentCMS's own set (its UI library's
   `IconResource.resx`, 38 icons) became `src/Components/IconName.ts`, made with `icon()` by `scripts/icons.mjs`,
   so the port writes `IconName.Delete` as the original does. The row actions are icon buttons with the label as
   tooltip and name, as FluentCMS's `ActionButtons` cascade `TableAction`; files, folders and field types show
   their icons. `name` and `builtInIcons` are deprecated: nothing in the repo uses them any more.

## 5. Decisions (recommendations; D-L5 left the details to them)

| # | Question | Recommendation |
|---|---|---|
| D-I1 | Namespace (`Icons.Regular.Size20.Save`) or flat names (`Save20Regular`)? | The namespace: it is Fluent UI Blazor's form, so ported markup changes least, and TypeScript completes it level by level |
| D-I2 | Generate at build time or commit the generated files? | At build time; the sources are pinned MIT packages |
| D-I3 | The built-in stroke set | Keep `name` until the skins' own components use the generated sets, then deprecate it. Deprecated 2026-10-10 |
| D-I4 | How a skin gets its own icons (2026-10-10) | A small copy, as Fluent UI Blazor's internal `CoreIcons`: `src/core-icons.ts`, written by `scripts/core-icons.mjs` from the generated set and kept equal to it by a test. The skin then doesn't depend on the whole set (14 MB in Fluent's case), in a dev server or in a package install |
| D-I5 | Slot names (2026-10-10) | Fluent UI Blazor main's: `IconStart`/`IconEnd`, Tab's `IconStart`, the tree item's four, Badge's `IconLabel`. Its nav item's `IconRest`/`IconActive` become `icon`/`iconActive` on SidebarNav's link data |
