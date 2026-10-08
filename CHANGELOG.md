# Changelog

Notable changes to the published `@tsazor/*` packages. A change to a package's public API
(`api/<package>.api.d.ts`, checked in CI by `pnpm api:check`) needs an entry here.

## Unreleased

- `@tsazor/fluent`: **CheckboxGroup**, several values out of `options` in a fieldset, bound as `string[]`. Its options
  are RadioGroup's (`value`, `label`, `disabled`); the bound array follows their order, and values it doesn't show
  stay in it. FluentCMS assigns a user's roles with it.
- **Blazor parity (Blazor 8)** `@tsazor/runtime`: `@SupplyParameterFromQuery()` works in any component, not only in a
  page, and needs no `@Parameter()` (still allowed alongside). The renderer supplies the value like a cascading value
  and again when a navigation changes it. FluentCMS reads `?id=` this way in components that aren't pages (its
  plugins). It was RouteView's job and threw without `@Parameter()`.
- **Blazor parity** `@tsazor/runtime`: an input's `Value` may be null (Blazor's `TValue? Value`). A `string | null`
  field (every string Swashbuckle generates without nullable reference types) binds to a text input, which hands
  back a string; a `string` field stays strict.
- `@tsazor/compiler`: the component's own class name stays free in markup, so `RoleList.types` reaches a static,
  as in Razor. It was rewritten to `this.RoleList`.
- `@tsazor/bootstrap`, `@tsazor/fluent`: `Button` takes `href` and is then a link that looks like the button (Fluent UI Blazor's
  `FluentAnchor`, Bootstrap's `<a class="btn">`): it navigates, opens in a new tab, and is announced as a link. A disabled
  one has no `href`. FluentCMS's buttons for "Add Role", "Edit" and "Cancel" are links.
- `@tsazor/compiler` **TZS032**: a `@code` member under one of Blazor's lifecycle names (`onInitializedAsync`,
  `OnParametersSet`, `OnAfterRenderAsync`, `Dispose`, …) is an error, with a quick fix that renames it to
  Tsazor's hook. Tsazor has one hook for each step, and the hook may be async; without `override`, a member
  called `onInitializedAsync` compiled without a word and never ran. Found while porting FluentCMS.
- **Fix** `@tsazor/bootstrap`, `@tsazor/fluent`: components await the callbacks they invoke, as Blazor's
  `await OnClick.InvokeAsync(e)` does. Button, Form, Dialog, Drawer, Tabs, Menu/Dropdown items, list
  items, Pagination, Alert and Toast dropped the promise. Two consequences are fixed:
  - an error in an async `onClick` or `onValidSubmit` reaches the ErrorBoundary, instead of being an
    unhandled rejection;
  - `render().click()` in tests waits for an async handler behind a library button.
- **Blazor parity** `@tsazor/runtime`: `ComponentBase.dispatchExceptionAsync(error)` (Blazor's
  `DispatchExceptionAsync`). It hands an error from outside the renderer to the nearest ErrorBoundary, for
  example an error from a callback of a DOM listener, a timer or a behavior. The skins use it for Escape and
  backdrop dismissal.
- **Blazor parity** `@tsazor/runtime`: the route constraint `nonfile`. `@page "/{**route:nonfile}"` takes every
  path that doesn't end in a file name, which is FluentCMS's page for all CMS URLs. On a catch-all it checks
  the whole remainder, as ASP.NET Core does.
- **Fix** `@tsazor/dotnet`, found by porting FluentCMS against its real OpenAPI document:
  - **Without `operationId`** (Swashbuckle's default), method names come from the path:
    `POST /api/User/Create` → `userCreate`. They were `postapiUserCreate`, and a path parameter made the
    output invalid TypeScript (`deleteapiUserDeleteId}`). Names that collide get the HTTP method, then
    the path parameters (`getOrdersById`). One warning replaces one warning per operation.
  - **`--envelope`:** the generated return type is the envelope's `data`. It was the envelope itself,
    while the client returned `data` as the body.
  - **Envelope errors on an error status** (FluentCMS answers 500 with them) are the result's message.
    It was `HTTP 500`.
  - An envelope error object `{ code, description }` reads as its description, or as its code when that
    is empty. It was `code: …` plus `description: …`.
  - **Value types in responses are present.** In a schema that appears only in responses, a property
    that can't be null is no longer optional: `Guid Id` reads as `id: string`, not `id?: string`.
    Swashbuckle lists no `required` by default, but ASP.NET Core writes every property. Blazing Pizza's
    generated `Marker.showPopup` changes accordingly.
  - A schema without a type (C#'s `object?`) maps to `unknown` without a warning.
- **Fix (Blazor parity)** `@tsazor/runtime` `NavLink`: every other attribute goes onto the anchor, as
  Blazor's `AdditionalAttributes` does.
  - `<NavLink class="nav-link" href="counter">` renders `class="nav-link active"` while the link is
    active.
  - `title`, `target` and `aria-*` pass through as well. Without this, the Blazor template's nav menu
    didn't compile (TZS025).
  - `cssClass` still works, but is deprecated in favor of `class`.
  - A link with neither a class nor the active state now renders no `class` attribute (it was
    `class=""`).
- **Fix** `@tsazor/bootstrap`, `@tsazor/fluent`: `sideEffects` in `package.json`. An app that uses a few
  components no longer bundles the whole library. The starter's app with Bootstrap went from 66.7 KB gz
  to 30.7 KB gz.
- New package `create-tsazor` (R3, [design-create-tsazor.md](docs/design-create-tsazor.md)):
  - `npm create tsazor@latest my-app` writes an app in the shape of `dotnet new blazorwasm`: MainLayout
    and NavMenu, Home, Counter, Weather, a Counter test, and strict TypeScript.
  - `--ui <package>` sets up any component library from its `tsazor.setup`.
  - `--dotnet` adds `@tsazor/dotnet`.
  - The tarball smoke now builds and tests the app the packed starter writes.
- `@tsazor/bootstrap` `addBootstrap` and `@tsazor/fluent` `addFluent`: they register the services the
  components use (the `Toaster`) in one call, `createTsazorApp({ services: addBootstrap })`. This is
  Blazor's `AddMudServices()`.
- **The setup contract for component libraries** ([component-libraries.md](docs/component-libraries.md)):
  - A library's `package.json` declares `tsazor.setup`: its stylesheets, its services function and the
    components its layout needs once.
  - The keyword `tsazor-components` makes it findable.
  - `npm create tsazor --ui <package>` reads the contract for any library.
  - Both skins declare it. `@tsazor/bootstrap` has `bootstrap` (its CSS) as a peer dependency.
- Tutorial: chapter *Component library* (Part 3, chapter 06; Testing, Localization and Next steps move one
  on): a skin and its vocabulary, forms with the library, a DataGrid, toasts and a dialog. The preview adds
  Bootstrap's stylesheet for lessons that use `@tsazor/bootstrap`; the in-browser type check knows `@tsazor/ui`.
  The type-argument inference (`inferTypeArgument`, new in `@tsazor/compiler`) is one function for the language
  server and the tutorial — the tutorial's copy lacked the lambda return type, so a DataGrid column's
  `Format="(v) => …"` typed `v` wrongly there. **Fix** `@tsazor/bootstrap`: `class` on a component replaced its
  Bootstrap classes (`<Button class="delete">` lost `btn`); it adds to them now, as in the Fluent skin.
- New app `apps/skins`: one set of pages built with both skins (`@using @tsazor/bootstrap`; the fluent build
  aliases the package and loads `fluent.css`), with a link to the same page in the other build; its gate
  runs the same 30 checks (axe on every page, the behaviors by role and label) on both, in CI too. Found
  and fixed on the way: `NavbarLink` (new, both skins) — plain links in Bootstrap's navbar had 4.26:1;
  **Fix** Bootstrap `AccordionItem` rendered `aria-expanded=""` (a boolean attribute) instead of "true"/"false";
  Bootstrap `Pagination` buttons get `type="button"` (they submitted an enclosing form), the labels "Previous
  page"/"Next page"/"Go to page n" and `aria-current` on the current page.
- The skins' shared parameters line up (found by comparing their manifests): `@tsazor/fluent` gets `help` on
  TextInput, TextArea, NumberInput, Select, Checkbox and Switch, the search/tel/url TextInput types, `Form`
  (alias of FluentForm), `CardBody` and `CardTitle`, and a Spinner `label`; `@tsazor/bootstrap` gets `ariaLabel` on
  Button, the inputs and Navbar, and its Spinner `label`, `ariaLabel` and `size="large"` (**Changed**: `text` ⇒ `label`).
  **Fix** (Bootstrap Spinner): the `role="status"` element was `aria-hidden` and its text outside it — screen
  readers announced nothing; now the status region carries the name. What still differs is skin-specific
  on purpose (Fluent `shape`, Bootstrap `pill`, …) — and `Table`, whose two APIs remain different.
- The rest of Tier 1 in both skins, with the same parameters: `ButtonGroup`, `DateInput` (the value is the ISO date
  text `"2026-10-07"` — no time zone to shift the day), `FileInput` (around the runtime's `InputFile`), `FormField`
  (label, help and the field's validation message around a control of your own), `Skeleton`, `Popover` (a
  non-modal dialog by its button); `@tsazor/fluent` adds `Navbar`, `@tsazor/bootstrap` `Grid` and `Typography`. Gallery
  page `/more`; the demo's components page shows them. The a11y gates wait for each page's heading before axe:
  a page that failed to load is empty, and axe found nothing wrong with it.
- Tier 1 parity of the two skins: `@tsazor/fluent` adds `RadioGroup`, `Accordion`/`AccordionItem` (panels as regions
  labelled by their header), `Collapse`, `Progress` and `ListGroup`/`ListGroupItem`; `@tsazor/bootstrap` adds `Switch`,
  `Stack` and `Divider` — each with the parameters of its counterpart in the other skin. Gallery page `/structure`;
  the demo's components page shows Switch, Stack and Divider.
- `@tsazor/fluent`: `Menu`/`MenuItem` (the menu button pattern on `@tsazor/ui`, also exported as `Dropdown`/`DropdownItem`),
  `Drawer`, `Tooltip` and the `tooltip` attachment; `@tsazor/bootstrap` exports `Menu`/`MenuItem` as aliases of
  `Dropdown`/`DropdownItem`, so both names work in both skins. Gallery page `/overlays`. **Fix** (type layer):
  a package export whose name differs from a component file only in case (`tooltip` next to `Tooltip.tsazor`)
  was bound to the component's shadow on case-insensitive file systems.
- **Changed** `@tsazor/fluent` `DataGrid` takes the QuickGrid shape of `@tsazor/bootstrap`'s (pre-1.0 API break: the
  `columns` array, `cellContent`, `compact` and `emptyText` give way to `PropertyColumn`/`TemplateColumn`, `small`
  and `EmptyContent`), with sorting, paging (`Paginator`, new), selection, an ItemsProvider and virtualization;
  `GridSort`/`PaginationState` re-exported. **Fix** (Fluent tokens, light theme): `--fui-color-amber-1` is
  #9C4D04 — #B75C06 had 4.19:1 on the amber glass (subtle warning badges), below WCAG's 4.5:1.
- **Changed** `@tsazor/fluent` adopts the shared vocabulary of `@tsazor/ui` (pre-1.0 API break): `Button`
  `intent` + `appearance` (solid/outline/subtle/transparent; `appearance="primary"` ⇒ `intent="primary"`),
  `Badge` `intent` (`color` ⇒ `intent`, `error` ⇒ `danger`, `brand` ⇒ `primary`; `filled` ⇒ `solid`), `Alert`/`Toast`/
  `Indicator` `intent` (`variant`/`severity`/`color`), `Pagination` `pageCount` + `onPageChanged`. `ToastProvider`
  is replaced by `ToastRegion` on the shared `Toaster` service (re-exported, with the vocabulary types).
  Dialog, Tabs, ids and the submit-attempt state run on the `@tsazor/ui` behaviors: nested dialogs
  close one at a time; tabs always link to their panels.
- **Changed** `@tsazor/runtime` `Virtualize`: like Blazor's, it renders no wrapper element — the spacers and
  items go into the parent; `SpacerElement` (default `div`) sets the spacers' tag; the captured extra
  attributes (which went onto the wrapper) are gone: style the scrolling container around it. A
  superseded `ItemsProvider` result (or failure) is dropped. DataGrid: `Virtualize` (with `ItemSize`,
  `OverscanCount`) renders only the rows in view, with `aria-rowcount`/`aria-rowindex`, from Items or an
  ItemsProvider; it doesn't combine with pagination. `DataGridModel.sortedItems`, `provideRange`,
  `setVirtualization`.
- Tutorial: a **Playground** (`/playground`, linked in the site bar): a free project with the lesson
  workbench — editor, problems, type check, preview — where files can be added, renamed and deleted;
  "Playground" on a lesson continues there with the lesson's files. Nothing is saved yet (the files
  live until the page reloads).
- DataGrid (QuickGrid-shaped). `@tsazor/ui`: `DataGridModel` (columns collected on every render, sort,
  rows of the page, `ItemsProvider` requests with an AbortSignal), `GridSort` (`byAscending(…).thenDescending(…)`),
  `PaginationState`, `toggleSelection`/`toggleAll`, `propertyTitle`/`propertyPath`. `@tsazor/bootstrap`: `DataGrid`
  (Items or ItemsProvider, sortable headers with `aria-sort`, row selection bound to `selectedItems`, empty
  and loading content, striped/hover/bordered/small/responsive/sticky header), `PropertyColumn`,
  `TemplateColumn` and `Paginator`; the columns take the row type from the grid (cascading type
  parameter). **Fix** (type layer): the "read as a TypeScript expression, not as text" note no longer
  lands on values that are plainly code (a lambda, a call, a member access).
- Cascading type parameters (Blazor's `[CascadingTypeParameter]`): `@attribute
  @CascadingTypeParameter("TGridItem")` on a generic component passes its type argument to the
  same-named type parameters of the components inside its content, so a column's
  `Property="(o) => o.customer"` is typed by its grid. `@tsazor/runtime`: the `CascadingTypeParameter`
  decorator (compile-time only); `@tsazor/compiler`: `ComponentMetadata.cascadingTypeParameters`, the
  Blazor form is TZS021 with the rewrite as its fix. The type layer infers a type parameter from a
  lambda's return type (`Property: (item: TGridItem) => TProp`). **Fix** (typed shadows): an optional
  function-typed parameter was checked against `(…) => T | undefined` instead of `((…) => T) | undefined`.
- `@tsazor/ui`: `Toaster` (the app's toasts as a DI service: `show({ title, message, intent, timeout })`,
  `dismiss`, `pause`/`resume` for WCAG 2.2.1, `subscribe`) and the `tooltip(text, options)` attachment
  (hover and focus, hoverable, Escape, `aria-describedby`, WCAG 1.4.13; the same text gives the same
  attachment). `@tsazor/bootstrap`: `ToastRegion`, `Drawer` (offcanvas, a modal panel) and `Tooltip`,
  plus the `tooltip` attachment and `Toaster` re-exported. `@tsazor/testing`: `renderTree` takes
  `{ services }`.
- Browser support documented (docs/browser-support.md): the current Chrome/Edge, Firefox and Safari. CI
  runs the browser gates (tutorial, Pages, Pizza, gallery, demo) in Firefox and WebKit too. **Fix**
  (tutorial preview): errors in the console panel lost their message in Firefox and Safari, whose
  `error.stack` has no "Name: message" head.
- **Fix** `@tsazor/runtime` `Virtualize`: the visible window is measured against the nearest scrolling
  ancestor (or the window), as in Blazor — a list without a height of its own inside a scrolling panel
  rendered every item (the demo: 30,033 DOM nodes for 10,000 items, now 105). Found by running the
  gates in WebKit.
- **Fix** `@tsazor/ui` `focusTrap`: focus returns to the opener also when a click didn't focus it
  (Safari doesn't focus buttons on click): the trap remembers the last pressed focusable element.
- Gate scripts: `TSAZOR_BROWSER=edge|firefox|webkit` (`scripts/browsers.mjs`); the a11y gates' wait for
  animations is capped at 3 s.
- `@tsazor/worker`: `WORKER_SCOPE` — the host hook through which a worker module loaded in-process (a
  test runner, the tutorial's lesson gate) gets its scope. Tutorial: chapter *Heavy work* (two
  lessons); the preview runs lesson workers as classic workers (a sandboxed frame can't start module
  workers).
- New package `@tsazor/worker` (docs/design-worker.md): heavy work off the main thread.
  `exposeWorker(api)` in the worker module; `class X extends defineWorker<Api>(() => new Worker(…)) {}` on
  the main thread — the class is the DI token (`services.registerType(X, { singleton: true })`,
  `@inject X x`) and a typed proxy whose methods return promises. Callbacks (also inside an options
  object) are called back on the main thread; an `AbortSignal` cancels (the call rejects at once with
  an AbortError); `transfer(value, [buffer])` moves buffers; errors keep their name and message; the
  worker starts on the first call; `{ pool: n | "auto" }` spreads calls; `terminate()`/`dispose()`;
  `inProcessWorker(api)` is the test double over a real MessageChannel. Under Trusted Types it
  installs a same-origin-only `default` policy (CSP: `trusted-types tsazor default`, docs/csp.md).
  Zero dependencies. The demo's /worker page and `verify:worker` check it in Edge, also under the
  strict CSP.
- `@tsazor/ui`: the form core — `FieldState` (input, help and message ids; validity from InputBase's
  field classes; the message only after a submit attempt; `aria-invalid`/`aria-describedby`) and
  `markSubmitAttempt`/`hasSubmitAttempt`. `@tsazor/bootstrap`: `Form` (EditForm that records submit
  attempts), `TextInput`, `TextArea`, `NumberInput`, `Select`, `Checkbox` (also as a `switch`) and
  `RadioGroup` (fieldset/legend), all on InputBase (`@bind-Value`) with label, help text and Bootstrap's
  validation styles. The demo gate checks the form in Edge (messages linked to their inputs, axe
  with errors showing).
- `@tsazor/bootstrap`: the shared vocabulary (design-component-library.md §3). **`variant` → `intent`**
  (`Intent`: primary, secondary, success, danger, warning, info, neutral) on Button, Alert (default now
  `info`), Badge, Spinner, Progress, Dropdown; **`outline` → `appearance`** (`solid`, `outline`, `subtle`,
  `transparent`) on Button and Dropdown; **`size` → `"small" | "medium" | "large"`** on Button, Dropdown,
  Pagination, Spinner (was `"sm"`/`"lg"`); Spinner `kind` typed; Navbar **`variant` → `theme`** (`light`/`dark`,
  Bootstrap 5.3 color modes); Pagination gets `ariaLabel`; Button, Alert, Badge take `additionalAttributes`.
  The skin re-exports the vocabulary types (`@import type { Intent } from "@tsazor/bootstrap"`).
- `@tsazor/workspace`: component metadata follows type aliases into packages' declaration files
  (`MetadataCache.resolveDeclarationFile`), so a parameter typed with a package's string-literal alias
  (`Intent` from `@tsazor/ui`) is a string parameter instead of an uncertain one (TZS026).
- `@tsazor/bootstrap`: `Dialog`, `Dropdown` and `Tabs` follow the WAI-ARIA patterns, built on `@tsazor/ui`
  (new dependency). **`Modal` is now `Dialog`** (`Modal` stays as an alias, D-C3); it traps focus and
  restores it, locks the page scroll, closes on Escape (new `closeOnEscape`), has `role="dialog"`,
  `aria-modal`, `aria-labelledby` (new `ariaLabel` without a title) and `additionalAttributes`; **`size`
  is now `"small" | "medium" | "large" | "xlarge"`** (was `"" | "sm" | "lg" | "xl"`). `Dropdown`: menu
  button pattern (arrow keys open and move, typeahead, Escape returns focus, Tab and outside clicks
  close), positioned by `anchoredPosition` (new `placement`); `DropdownItem` gets `role="menuitem"` and
  `disabled`. `Tabs`: roving tabindex, arrow keys, tab–panel ids, new `ariaLabel` and `onSelected`;
  `Tab` renders `role="tabpanel"`. `@tsazor/ui`: `createLayer()` and the `layer` option of `focusTrap`
  and `dismissable` (one overlay's behaviors share a layer); `anchoredPosition`'s `placement` may be a
  function.
- **Renamed:** `@tsazor/components` is now `@tsazor/bootstrap` (the Bootstrap 5 skin of the component
  library, D-C2 in docs/design-component-library.md). Write `@using @tsazor/bootstrap`; the API is
  unchanged so far. The tutorial reference lists it under `reference/components/bootstrap`.
- New package `@tsazor/ui` (component library core, docs/design-component-library.md): unstyled behaviors
  as attachments — `focusTrap`, `dismissable` (Escape, outside press; only the topmost layer reacts),
  `scrollLock`, `rovingFocus` (arrows, Home/End, typeahead), `anchoredPosition` (fixed positioning with
  flip and shift, no dependencies) — plus `uniqueId`, focus helpers, the layer stack and the shared
  vocabulary types `Intent`, `Appearance`, `Size`, `Placement`, `Orientation`.
- `@tsazor/compiler`, `@tsazor/lsp`: S4. New `explainTypeScriptError(code, message)` appends a plain-language
  `Hint:` to the common TypeScript errors (implicit any, possibly null/undefined, unknown names and
  members, types that don't fit); the language server, `tsazor check` and the tutorial use it, so
  their TS messages now end with the hint. The language server offers TypeScript's "Infer
  parameter types from usage" quick fix for implicit-any errors in `@code`.
- `@tsazor/lsp`, `@tsazor/cli`, `@tsazor/vite-plugin`: `tsazor check` warns `TSZSTRICT` (once per tsconfig) when the
  tsconfig of checked files leaves `strict` off or switches one of its flags off again — strict
  TypeScript is the only supported configuration (S2). A warning: exit code and builds are unaffected.
- `@tsazor/runtime`, `@tsazor/compiler`: `@State()` (Tsazor extension; F6, docs/design-state.md).
  `@State() accessor x = …` makes an assignment to `x` schedule a render of its component, like
  `stateHasChanged()` (coalesced, `shouldRender()` consulted, equal values ignored, quiet before
  the first render and during `buildRenderTree`). Shallow: only assignments count. New runtime
  API: the decorator `State`. The compiler imports it itself (like `Bindable`) and reports TZS030
  for `@State()` on a non-accessor (fix: insert `accessor`) or together with
  `@Parameter()`/`@Bindable()`; TZS030's title now reads "@Bindable()/@State() needs an
  auto-accessor of its own.". Tutorial: lesson *Fields that render*.
- `@tsazor/compiler`, `@tsazor/runtime`, `@tsazor/lsp`: transitions and animations (Tsazor
  extensions, Svelte's; F4/F5 in docs/design-svelte-features.md). `@transition`, `@in` and
  `@out` (with the valueless `:global` modifier) play a `Transition<E>` when an element enters
  or leaves; a leaving element stays in the DOM until its outro ends (the applier's indexing
  skips it). `@animate` on a keyed loop row plays an `Animate<E>` (FLIP) when the row moves.
  New runtime API: the types `Transition`, `TransitionConfig`, `TransitionOptions`, `Animate`,
  `TransitionSettings`, the functions `addTransition`, `addAnimate` (what the compiler emits;
  they install the motion support, so apps without them don't bundle it) and
  `configureTransitions` (reduced motion is respected by default). New entry points:
  `@tsazor/runtime/transition` (`fade`, `blur`, `fly`, `slide`, `scale`, `draw`, `crossfade`),
  `@tsazor/runtime/animate` (`flip`), `@tsazor/runtime/easing` (Svelte's easing set). Compiler
  AST: attribute kinds `motion` and `motionGlobal`, type `MotionDirective`. Diagnostics TZS008
  (duplicates, `@transition` with `@in`/`@out`, a misplaced or valued `:global`, `@animate`
  outside a keyed loop row, motion on a component tag) and TZS009 (no value). LSP: completions
  and hover. Tutorial: chapters *Transitions* (9 lessons) and *Animations*.
- `@tsazor/compiler`, `@tsazor/runtime`, `@tsazor/lsp`: `@attach` (Tsazor extension, Svelte 5's
  attachments; F2 in docs/design-svelte-features.md). `@attach="fn"` and any number of
  `@attach:<name>="fn"` on an element run `fn(element)` once the element is in the DOM (at the
  batch end, before `onAfterRender`); a returned function is the cleanup, called when the element
  is removed, the component disposed or the value changes (compared by identity; `null`,
  `undefined`, `false` attach nothing; a member method is bound like a delegate). New runtime
  API: the type `Attachment<E extends Element = Element>`, `addAttachment(builder, sequence,
  name, value)` (what the compiler emits; it installs the attachment support, so apps without
  `@attach` don't bundle it) and `FrameType.Attachment`. Exceptions go to the nearest
  `ErrorBoundary` (phase `afterRender`). Typed shadows check the value as
  `Attachment<HTMLInputElement>` etc. by tag. Diagnostics: no value TZS009; a duplicate name,
  `@attach:` without a name and `@attach` on a component tag TZS008. Rows with `@attach` are
  never reused (H2) or static blocks (F1a). LSP: completions and hover. Tutorial: chapter
  *Attachments*.
- `@tsazor/runtime`: `<Await>` (Tsazor extension, Svelte's `{#await}`; F3 in
  docs/design-svelte-features.md) — the built-in templated component `Await<TValue>` with `For`
  (a promise; a plain value counts as resolved, `null`/`undefined` as pending) and the
  `<Pending>`, `<Then Context="…">` and `<Catch Context="…">` fragments. A new promise starts
  over, a stale one is ignored, nothing renders after dispose; a rejection without `Catch` fails
  the component (nearest `ErrorBoundary`). `@tsazor/lsp` (and the tutorial's checker) infer
  `TValue` through the awaited type of `For`, so the `Then` context is typed; slot completions
  are offered in PascalCase (`<Then>`, `<ErrorContent>`).
- `@tsazor/compiler`, `@tsazor/runtime`: skipping unchanged keyed rows (render hints H2,
  docs/design-render-hints.md). A `@foreach` row that is one element with `@key` evaluates its
  dynamic values first and calls the new `RenderTreeBuilder.reuseKeyed(site, key, values)`
  (`@internal`, with `setReuseSource`): when the values equal the previous render's for that key,
  the previous frames are reused and the diff skips the row. Rows with control flow, code blocks,
  `@ref`, `@attributes`, `@bind`, event modifiers, inner keys, expressions with effects or child
  components getting anything but primitive values are built as before. Part of `renderHints`
  (off with `renderHints: false` or `optimize: false`; never in typed shadows). Selecting a row
  among 11k (A/B on one machine): ~13.5 → ~8–10 ms.
- `@tsazor/compiler`, `@tsazor/runtime`: stable event handlers (render hints H1,
  docs/design-render-hints.md). An event-handler lambda that captures only constant render-time
  locals (`const`, `@foreach (const …)` variables, an unassigned template `context`) compiles to a
  method of the component plus `EventCallback.bindWith(this, factory, [captured])` (`@internal`
  compiler API), equal across renders while the captured values are the same — re-rendering
  unchanged rows swaps no handler. New options `renderHints` (default true) and the umbrella
  `optimize` (default true; `false` turns `staticMarkup` and `renderHints` off) on the compiler's
  `CodegenOptions`/`CompileOptions`, the Vite plugin and `TransformTsazorOptions`. Selecting a row
  among 11k (A/B on one machine): ~25–30 → ~13–14 ms. Parameter change detection keeps Blazor's
  rule (`EventCallback.equalsAsParameter`, `@internal`): a handler that captures locals counts as
  changed, as a C# closure does, so child components re-render with their parent exactly as before.
- `@tsazor/runtime`: replacing an event handler no longer checks the DOM for a leftover inline
  handler string (`hasAttribute`) — it cannot exist once the element had a handler. Selecting a row
  among 11k: 19 → 16 ms.
- `@tsazor/runtime`: features an app does not use stay out of its bundle — the document head
  (`HeadOutlet` and the sections it needs) is mounted once `PageTitle` or `HeadContent` is part of the
  app, `CultureService`/`StringLocalizer` are service defaults their own modules register (still
  resolvable without registration; `createTsazorApp({ localization })` unchanged), and the renderer's
  error-boundary check no longer imports the `ErrorBoundary` components. The bench app: 29.4 → 25.4 KB gz.
- `@tsazor/runtime`: `Router` gets Blazor's `OnNavigateAsync` (`NavigationContext { path, signal }`) and
  `<Navigating>`. Lazy routes (E5): `LazyRouteEntry { template, load, authorize }` in the manifest
  (`RouteManifestEntry`), loaded once on the first navigation; `RouteTable.match`/`matchRoute` return
  a `RouteMatch` (eager or lazy entry); a failed chunk reloads the target once.
- `@tsazor/vite-plugin`: `lazyRoutes: true | string[]` — the matched pages load lazily, each as its
  own chunk, its layout with it.
- `@tsazor/runtime`: `CultureService.setDefault` applies while the culture is still the previous
  default (it compared against the new default and never applied). Every public export and member
  of runtime, testing, dotnet and vite-plugin is documented (the reference's API pages).
- `@tsazor/compiler`: `DIAGNOSTIC_CATALOG` (every code: severity, when it is reported, an example,
  the fix) and `DIAGNOSTIC_MESSAGES` are exported — the source of the reference's diagnostics page;
  `RETIRED_DIAGNOSTIC_CODES` (`TZS007`, `TZS010`). `TZS001` reads "Invalid or misplaced directive."
  (it was "Unknown directive.", which never matched what it reports).
- `@tsazor/runtime`: scrolling on navigation as in Blazor — after an internal navigation the
  `Router` scrolls to the fragment's element (`orders#total`, by id, else by name) or to the top;
  a link that only changes the fragment of the current page adds a history entry and scrolls,
  without `LocationChanging`/`LocationChanged`.
- Component manifests (`tsazor-components.json`, `@tsazor/compiler` `ComponentMetadata`): a
  component `doc` (the class JSDoc, or a leading `@** … *@` in a `.tsazor` file — the markup
  counterpart of `/** */`) and the parameter `default` as written. Every component of
  `@tsazor/components` and `@tsazor/fluent` is documented.
- API snapshots of every published package (`api/`), checked in CI (S1).
- `@tsazor/testing`: `render(Component, { parameters, services })` with typed parameters;
  `find`, `findAll`, `click`, `change`, `setParameters`, `settle`, `markup`; a component's
  failure rejects the call that waited for it.
- `@tsazor/runtime`: `TsazorHttp` takes a `fetch` option; `AuthorizeRouteView` derives from
  `RouteView`; `AuthorizeView`'s `ChildContent` receives the authentication state; hash mode
  works over a `MemoryHistory`.
- `@tsazor/compiler`: `TZS031` (names reserved by `ComponentBase`); unknown names in text read
  as an expression get an explanation (`explainExpressionValue`).
- `@tsazor/runtime`: `createTsazorApp({ strictCsp: true })` writes style attributes through the
  CSSOM, for a CSP without `'unsafe-inline'`; `MarkupString` goes through a Trusted Types policy
  named `tsazor` (see docs/csp.md).
- F1a static markup blocks: `@tsazor/compiler` emits a static subtree as one `addMarkupContent`
  frame (option `staticMarkup`, default on; the Vite plugin passes `staticMarkup: false` through as
  an escape hatch); `@tsazor/runtime` parses each markup string once, clones it per insertion and
  inserts single-node blocks without boundary comments.
- Accessibility (E9): `@tsazor/fluent` dark-theme fills meet 4.5:1 (`--fui-brand-background*`,
  `--fui-color-*-filled`), the light subtle brand badge too, and the dialog's Shift+Tab focus trap
  is fixed; `@tsazor/components`: `Progress` gets `ariaLabel` (its name), `Badge` uses Bootstrap's
  `text-bg-*`, `ListGroupItem` is always an `<li>` with a real `<a>`/`<button>` inside.
- `@tsazor/vite-plugin`: with `check: true`, the dev server reports type errors in the
  background without blocking.
- `@tsazor/dotnet`: generated code is commented in English and imports only the validation
  decorators it uses.
