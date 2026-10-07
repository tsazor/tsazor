# Changelog

Notable changes to the published `@tsazor/*` packages. A change to a package's public API
(`api/<package>.api.d.ts`, checked in CI by `pnpm api:check`) needs an entry here.

## Unreleased

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
