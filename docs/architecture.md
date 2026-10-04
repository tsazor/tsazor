# Architecture & HMR

## Render path (Blazor 1:1)

```
.tsazor  ──(Vite plugin: @tsazor/compiler)──►  TS module
              export default class X extends ComponentBase {
                  buildRenderTree(__builder: RenderTreeBuilder): void { … }
              }
TS      ──(esbuild)──►  JS (sourcemap chain compiler → esbuild; standard decorators lowered)
Browser ──(Renderer)──►  RenderTree frames ──(diff)──►  edit list ──(DomRenderer)──►  DOM
```

- **RenderTree:** a flat frame array (`FrameType`: Element, Text, Attribute, Component,
  Region, ElementReferenceCapture, Markup) with monotonic sequence numbers per path — the
  basis of the Blazor-style diff (sequence matching, `@key` support).
- **Diff** (`render-tree/diff.ts`): a port of Blazor's `RenderTreeDiffBuilder` — an ordered
  two-pointer walk over sequence numbers, a key dictionary only when keys occur, key miss ⇒
  remove + insert, duplicate keys ⇒ error. Pure data without DOM access: an edit list
  (`RenderTreeEditType`, Blazor's edit types with sibling indices, `StepIn`/`StepOut`,
  permutation lists) plus the child components to instantiate/retain and to dispose
  (including those nested inside removed elements). The first render is a diff against the
  empty tree.
- **Renderer/DomRenderer:** the Renderer instantiates/disposes according to the diff; the
  DomRenderer applies the edits: sibling index → DOM node via a forward cursor
  (`LogicalChildren`) over the logical children of an element or of a `LogicalRange`
  (logical-range.ts, Blazor's "logical elements"). Component output (`ComponentState.range`)
  and markup blocks are ranges delimited by a start and an end comment; each counts as one
  child, is inserted, permuted and removed as a unit, and ranges nest. Application is
  transactional: a `DomJournal` records every mutation of previously existing DOM, a failing
  pass is rolled back, and the DOM shows the live tree again (limits: ref captures,
  custom-element callbacks, focus/caret). Fresh subtrees are built detached and inserted
  once. Attributes (dom-attributes.ts): `value`/`checked`/`selected` as properties (a
  select's target value is set after its options and re-applied when the options change),
  booleans as minimized attributes, primitives as attributes, objects onto writable
  properties; event listeners directly on the node, one stable listener per event name
  (deliberate: Blazor's delegation exists because of the WASM bridge, which doesn't exist
  here). As in Blazor, event modifiers are attribute frames of their own
  (`__internal_preventDefault_onclick`, `__internal_stopPropagation_onclick`, bool) and can
  therefore change per render: they set flags on the listener for that event (no DOM
  attribute); a flag without a handler keeps a listener of its own
  (`@onsubmit:preventDefault`). The static `EventHandlerFlags` of `addEventHandler` remain
  compatible and are OR-ed with the attribute flags.
- **Dispatcher/batching:** one render queue per renderer (`RenderQueue`, parent-first:
  smallest tree depth first, FIFO at equal depth). The first render request schedules a
  batch through the renderer's `Dispatcher` (microtask); the batch renders until the queue is
  empty — requests made *during* the batch (`stateHasChanged` in render or in synchronous
  lifecycle hooks, children instantiated by the diff) run in the same batch. A synchronous
  lifecycle requests its render synchronously (Blazor's `RunInitAndSetParametersAsync`); only
  returned promises are awaited. The end of a batch is a defined point
  (`renderer.onBatchCompleted`, which delivers the batch's render passes in order). Each
  render pass applies its edits immediately (decision B3: Blazor's apply-the-whole-batch-at-once
  serves the WASM→JS boundary; here the batch runs synchronously, and an end-of-batch applier
  would only have to copy the frames referenced by index); the next pass of the same
  component diffs against the committed tree. Errors are isolated per component (phases
  `render|diff|apply|lifecycle|afterRender|event|dispose|batch`): everything except dispose
  and batch-internal errors is first offered to the nearest error boundary along the logical
  parent chain (see below, **ErrorBoundary (3.1)**); without one it goes to
  `renderer.errorHandler` (`{ error, component, phase }`, default `console.error`); the rest
  of the batch continues, and the failed component's live tree remains the diff baseline.
  Render loops (> 100 passes of one component per batch) are reported and aborted. Event
  tracking runs per renderer (no global renderer). `EventCallback` re-renders the owner after
  the handler (Blazor semantics).
- **ErrorBoundary (3.1):** the `ErrorBoundary`/`ErrorBoundaryBase` components and the
  renderer routing are the port of Blazor's `HandleExceptionViaErrorBoundary`
  (Renderer.cs) + `ErrorBoundaryBase.cs` (semantics as of dotnet/aspnetcore main,
  2026-10-01). For all phases except `dispose` and `batch` (and when a component can be
  identified), `handleComponentError` walks along `state.parent`, including the source
  itself — so an error inside a boundary's own ErrorContent is caught by that boundary
  again, bounded by `maximumErrorCount`. The first component found with
  `isErrorBoundary === true` (Tsazor's IErrorBoundary marker, `isIErrorBoundary`) receives
  the error; before that, the renderer renders its next pass as an empty tree
  (`state.forcedRenderFragment`, Blazor's `AddToRenderQueue(boundary, empty)`) — which tears
  down the failed subtree in terms of diffing and disposal, even when a custom subclass
  renders no difference — and afterwards as its own output again (ErrorContent).
  `handleException` counts errors between two recoveries (`maximumErrorCount`, default 100,
  as in Blazor); beyond that, the error is routed to the error handler as fatal at the
  boundary's position (Blazor rethrows in `HandleException`, which ends up in
  `HandleExceptionViaErrorBoundary`). `Recover()` only has an effect in the error state
  (counter reset + re-render). Deviations (all documented): no `NavigationException` (does
  not exist in TS; navigation is synchronous, there is no redirect-exception path), the
  `ErrorContent` context is `unknown` instead of `Exception`, the `onError` logging hook
  logs via `console.error` instead of an injected `IErrorBoundaryLogger`, and a failing
  async `onError` surfaces as an unhandled promise rejection instead of Blazor's
  exception-in-RenderFragment cascade.
- **DynamicComponent (3.2):** a port of Blazor's `DynamicComponent.cs` (a component, not a
  renderer hook): `type`/`parameters` as parameters; the child is opened in
  `buildRenderTree` via `openComponent(0, toComponentDefinition(type))`. The
  `defineComponent` cache turns equal types into identical definition objects, so normal
  component diffing applies: the same `Type` updates the child by re-setting its parameters,
  a change of `Type` replaces it (dispose + new). `instance` is set through the component
  reference capture (Blazor's `Instance` — not a parameter). Only `Type`/`Parameters` are
  accepted; any other parameter throws Blazor's "does not accept a parameter with the name
  'X'" in `applyParameterValues` (before assignment), a null `Type` throws Blazor's "requires a
  non-null value for the parameter Type." (after it — Blazor's order). In markup, TZS025
  (2.1 metadata) catches the case statically.
- **Lifecycle** (`ComponentBase`, Blazor's `SetParametersAsync`): parameters are set
  first — an undeclared parameter (neither `@Parameter` nor `@CascadingParameter`,
  case-insensitive, no `captureUnmatchedValues`) throws Blazor's "Object of type 'X' does not
  have a property matching the name 'Y'" (phase `lifecycle`; since 2.2 the compiler already
  reports it statically, TZS025, and emits `ValueExpression` only when declared). Then, the
  first time, `onInitialized`, then `onParametersSet`, then `stateHasChanged`. Synchronous
  hooks continue synchronously and render exactly once, in the parent's batch. If a hook
  returns a promise, the state after its synchronous part is rendered immediately (loading
  state) and processing continues on completion: after an async `onInitialized` come
  `onParametersSet` + render, after an async `onParametersSet` another render
  (`CallStateHasChangedOnAsyncCompletion`). Deviation: Blazor skips the intermediate render
  when the task has already completed synchronously — a JS promise cannot be inspected
  synchronously, so an `async` hook without a real `await` renders one extra time. Errors
  (sync or rejection) go to the error hook; `waitUntilIdle` waits for running hooks.
  `stateHasChanged` requests at most one render and consults `shouldRender()` — except
  before the first render, which always happens (R5; HMR bypasses `shouldRender` like
  Blazor's metadata update). `onAfterRender(firstRender)` runs at the end of the batch
  (before the `onBatchCompleted` listeners) for every component with a committed pass, once
  per batch, **children before parents** (deepest first, render order at equal depth);
  components disposed during the batch are skipped; `firstRender` is `true` exactly once per
  instance. Deviation: Blazor calls it per render entry in render order (so parent first for
  a new subtree). An async `onAfterRender` is tracked and does not render afterwards
  (Blazor); errors → phase `afterRender`; `stateHasChanged` inside it starts the next batch.
  **Disposal** follows Blazor's disposal queue: parent before children (breadth-first), after
  the pass that removes them; `disposeAsync` takes precedence (then no `dispose`, like Blazor
  with `IAsyncDisposable` + `IDisposable`), a running `disposeAsync` is tracked, errors →
  phase `dispose`, and the remaining disposals continue. `ComponentBase` keeps its own
  bookkeeping (initialized, pending render, first render, after-render callbacks) in
  `#private` fields: TypeScript's `private` is compile-time only, and a component field such
  as `initialized` would otherwise overwrite the flag — Blazor's private base fields can't
  collide either. **`disposeSignal`/`observe` (Tsazor extension):** before `dispose`/
  `disposeAsync`, the renderer calls `ComponentBase.disposeInternal()`, which aborts the
  (lazily created) `disposeSignal` and stops every observed subscription (a throwing
  unsubscribe → phase `dispose`). An `observe` notification calls `onNext`, then
  `stateHasChangedInternal()` — so it joins the render queue like any request and a burst
  coalesces into one render. Work outside the render pipeline reports failures through
  `RenderHandle.reportError(error, phase)` (internal) into `handleComponentError`:
  `onNext`/source errors as `lifecycle`, a failing `@Bindable` change callback as `event`
  (attributed to the component that assigned), so both reach the nearest `ErrorBoundary`.
  An async `observe` handshake is deliberately not tracked by `waitUntilIdle`; a `@Bindable`
  callback is.
- **Cascading values** (Blazor's `CascadingParameterState`): a supplier is any component
  with `isCascadingValueSupplier` (`CascadingValue`, EditForm, CascadingAuthenticationState,
  Tabs, …). Matching follows `CanSupplyValue`: with no name on either side, by type (static
  `cascadeType` or runtime value), otherwise by name, case-insensitively; the nearest
  supplier wins. Cascades are resolved afresh on every parameter set; the consumer subscribes
  to every non-fixed supplier it resolves to (`IsFixed` ⇒ no subscription) and keeps its
  last snapshot of direct parameters. Before every render pass of a supplier, the renderer
  checks `mayHaveChanged(previous, current cascadeValue)`; if it may have changed, it re-sets
  the parameters of all subscribers directly (snapshot + fresh cascades) — intermediate
  components with `shouldRender() === false` don't hold the update up. Dispose
  unsubscribes.
- **Parameter change detection** (Blazor's `ParameterView.DefinitelyEquals`): when a parent
  re-renders, a retained child only gets `setParametersAsync` if a parameter may have
  changed — different names/order or a value with `mayHaveChanged` (Blazor's
  `ChangeDetection`). Only equal primitives (string, number, boolean, bigint, symbol;
  `Object.is`), `null`/`undefined`, and `EventCallback`s with the same receiver + delegate
  count as unchanged; objects, arrays, functions (every `ChildContent`) and `Date` always
  count as changed. Cascading values go through the subscription. Parameter metadata
  (including inherited, case-folded names, the capture property, the cascading list) is
  cached per class.
- **Parameter metadata (standard decorators, TC39):** `@Parameter(options?)` and
  `@CascadingParameter(options?)` are field decorators (also on `accessor` fields and
  setters; `static`/`#private` ⇒ error). They record the member in the class's decorator
  metadata (`context.metadata`, published by the language as `Class[Symbol.metadata]`) —
  under a private key, **a separate map per class**; the metadata objects inherit
  prototypically like the classes, and only the class's own one is written to. Reads go
  along the class chain (`getParameterInfo`: base first, a redeclaration in the derived
  class wins; `getOwnParameterMetadata` returns only the class's own), and the result is
  cached per class (B6). Decorators run during class definition, i.e. before anything can
  read the metadata — they don't invalidate the cache; only
  `defineParameter(Class, name, options)` (hand-written components without decorator
  syntax, tests) does. **Polyfill:** browsers don't ship `Symbol.metadata` yet;
  `parameter-metadata.ts` sets it to `Symbol.for("Symbol.metadata")` (the symbol esbuild's
  decorator helpers also fall back to). tsc's emit only creates `context.metadata` if
  `Symbol.metadata` exists when the class is defined — ESM guarantees the order: every
  decorated class imports the decorators from this module, and the module itself imports
  nothing (a leaf, no cycle possible), so it is evaluated first. It is the only module with
  a side effect (`"sideEffects"` in the runtime package); unused built-ins are dropped from
  the bundle. A legacy call (`experimentalDecorators`) throws with a hint.
- **Class fields (`[[Define]]`, the TS default from ES2022):** every declared field is created
  on the instance via `defineProperty`, even without an initializer (then `undefined`).
  Consequences that runtime and compiler take into account: field initializers run in the
  constructor (which is why `inject()` resolves from the service context that the renderer
  activates around instantiation — `withServices`); a field in a derived class shadows an
  accessor of the same name in the base (instead of calling the setter, as with `[[Set]]`),
  and a field without an initializer sets the base value to `undefined` — a pure type
  redeclaration is written `declare x: T` (otherwise TS reports TS2612/TS2610 in the
  editor). The generated class itself declares only `@inject` fields and the `@code`
  members, never fields of the code-behind class.
- **ComponentState/RenderHandle** mirror Blazor; `RenderHandle.track(promise)` registers
  in-flight async work so that `waitUntilIdle` includes it (e.g. Virtualize loads).

## Compiler

Pipeline: markup tokens + TS span scan (balanced brackets, skips
strings/templates/comments/regexes) → AST → codegen. The compiler stays "dumb" at the TS
level: `@code` blocks are taken verbatim; markup expressions, attribute values, control
headers and statement runs are rewritten via the TS AST (`rewrite.ts`: syntactic parse,
scope chain, member → `this.X`, C# convention; the rule is in
[language-reference.md](language-reference.md#members-and-free-names)). The globals list is
generated from TypeScript's `lib.es*`/`lib.dom` declarations (`scripts/gen-globals.mjs`;
a test keeps it in sync).

The **Vite plugin** adds what Blazor's build (Roslyn) otherwise provides:

1. `_Imports.tsazor` chain + `@using` → `resolveComponent`/`resolveType` via the file system,
2. runtime built-ins as markup tags (Blazor's `Microsoft.AspNetCore.Components.Web`),
3. inherited `@import`s from the `_Imports` chain, with relative specifiers rewritten for the file,
4. a `virtual:tsazor-routes` manifest of all `@page` files,
5. parameter metadata of the target components (`resolveComponentMetadata`, 2.1).

### Import model and resolution (A3)

There is no import inference from identifiers. A free name in markup/`@code` is either
local, a JS global, bound via `@import` (in the file itself or the `_Imports` chain) — or
a member (`this.X`). Resolution lives in `@tsazor/workspace`
(`createFileContext` + `resolutionOptions`) and is used identically by the Vite plugin
(`transformTsazor`), the library builds (`components`, `fluent`) and the language server
(shadow modules, diagnostics, hover, completions):

- **`@import`**: the compiler parses the value syntactically with the TS parser (TZS016 for
  an invalid form) and emits it verbatim (mapped); inherited imports arrive as
  `inheritedImports` (nearest level first, already rewritten) — the file shadows the chain,
  and duplicate bindings/side-effect imports are dropped. The bound names are free names in
  the expression rewriter — unless a declared member (`@code`, code-behind, `@inject`) has
  the same name.
- **Compiler-owned imports** remain generated: `ComponentBase`, `RenderTreeBuilder`,
  `EventCallback`, `Parameter`/`CascadingParameter`/`inject` (when the code needs them and
  no `@import` binds them), components from tags, and `@inject`/`@inherits` types. The
  generated code itself accesses them through hygienic aliases (`… as __tsazor_EventCallback`,
  builder parameter `__builder` as in Razor), so that neither an `@import type` nor a local
  of the same name collides.
- **Default vs. named** comes from the actual export of the target file
  (`scanModuleExports`, syntactic: a named export of the same name, otherwise default;
  `.tsazor` ⇒ default) — never from the file name.
- **Tags**: explicitly imported ⇒ used directly; otherwise the enclosing folders (file,
  `_Imports` levels; nearest wins), otherwise all `@using` sources together — folders,
  runtime built-ins, bare packages. A bare package only contributes names from its
  **export list**: the entry module from `package.json` (`exports["."]` → `module` → `main`
  → `types`) is read syntactically, and relative `export *` are followed (no separate
  manifest needed; the library builds produce `dist/index.js` with
  `export { default as X }` anyway). More than one source ⇒ TZS017, none ⇒ TZS005, a missing
  `@using` folder/package ⇒ TZS018 (warning).
- Diagnostics of an `_Imports.tsazor` are attached to its level (`ImportsLayer.diagnostics`);
  the plugin throws its errors at the importing module and reports warnings once.

### Parameter metadata (2.1)

A static, purely syntactic description of every component's parameters — the counterpart
of the decorators' runtime metadata (`getParameterInfo`), without a type checker. Two
steps:

1. **Per-file extraction** (`@tsazor/compiler`, `metadata.ts`):
   `extractTsazorMetadata` (`.tsazor`: the `@code` members of the generated class,
   `@typeparam`, base = code-behind class ⇒ `@inherits` ⇒ `ComponentBase`, as in the
   compiler; own + inherited `@import`s) and `extractModuleMetadata`
   (`.ts`: all classes, imports, local type aliases, exports/re-exports,
   `defineParameter(K, "x", …)` calls). Parameters are `@Parameter(…)`/
   `@CascadingParameter(…)` on fields, `accessor` fields and setters whose decorator is
   bound to the runtime export (also when renamed or via `* as rt`); `static`/`#private`
   don't count (the runtime throws there). Names the compiler imports itself
   (`Parameter`, `CascadingParameter`, `Bindable`, `EventCallback`, `RenderFragment`,
   `ComponentBase`) count as runtime names in `.tsazor` even without an `@import`.
   `@Bindable(…)` (Tsazor extension) records its member plus the synthesized parameters
   (`bindable` on the value, `synthesizedBy` on the others): `<name>Changed` (or the
   `changed` option) typed `EventCallback<T>` with the runtime's `EventCallback` as its
   reference whatever the module imports, `T` = annotation, literal type or `unknown`; with
   `expression: true` also `<name>Expression: string`. At runtime the decorator registers
   the same names; the value's metadata entry carries the accessor's backing slot (`store`),
   which `applyParameterValues` writes so a parameter set never invokes the callback.
2. **Resolution** (`resolveComponentMetadata` via a `MetadataHost`): the base class chain is
   flattened as in the runtime — base first, a redeclaration wins in the base's position
   (map semantics) — across relative `.ts`/`.tsazor` files, the code-behind file, and, for
   `@tsazor/runtime` or package bases, their manifest. The base's type arguments are
   substituted (`extends InputBase<string>` ⇒ `Value: string`, category `string`).

Per parameter (`ComponentParameter`): `name`, `category`, `typeArgument`
(`T` of `EventCallback<T>`, or the context type of `RenderFragment<T>`), `type`
(the annotation as source text), `inferredType` (literal initializer without an
annotation), `optional` (`?:` or `| undefined`), `hasInitializer`, `member`
(`field`/`accessor`/`setter`), `cascading` (`name`, `type` as source text), `doc`
(JSDoc), `declaredBy`, `uncertain` and `references` — the binding of every root identifier
in the type (`runtime`, `import` with specifier + file, `local`, `typeParameter`,
`global`), i.e. the import context with which 2.4 can reference the type in the shadow.
Per component: `typeParameters` (name, constraint, default), `base`, `isComponent` (the
chain reaches `ComponentBase`), `abstract`, `incomplete` (base not resolvable).

**Categories** (from the annotation, with parentheses and `null`/`undefined` removed from
unions): `string` — `string`, string-literal/template-literal types, or a union that
contains one of them (`"a" | "b"`, `string | number`: a static attribute value remains a
valid string); `EventCallback` / `EventCallback<T>` — the runtime export, also inside a
union (`EventCallback<X> | ((x) => void)`); `RenderFragment`; `RenderFragment<T>` — a
function type `(ctx: T) => RenderFragment` (Tsazor's notation) or a generic
`RenderFragment<T>` reference; `captureUnmatchedValues` — from the decorator option;
otherwise `value` (delegates like `(e) => void` are values, like Blazor's `Action<T>`, with
`delegate: true` — a method group assigned to one is bound). Type aliases are followed —
locally and through relative imports including re-exports, generic aliases with their
arguments substituted. Without an annotation, a literal initializer decides
(`href = ""` ⇒ `string`).

**Not decidable without a checker** (category `value`, `uncertain: true`): types from bare
packages other than the runtime (e.g. an alias in a third-party library), unresolvable
relative imports, non-literal initializers without an annotation
(`label = defaultLabel()`). Conditional, mapped and indexed-access types as well as type
parameters (`TItem`, unsubstituted) are `value` — safe enough, because an attribute on such
a parameter has to be an expression. The type in `typeArgument` is source text in the
scope where it appears (for an alias: the alias's module).

**Resolution in the resolver:** `FileContext.resolveComponentMetadata(tag, usings,
imports?)` returns the target component's metadata — the same resolution as
`resolveComponent` (`@import` binding first, then folders, `@using` sources, runtime
built-ins, packages); `resolutionOptions` passes it as
`CompileOptions.resolveComponentMetadata` to the compiler, plugin, library builds and
LSP. Since 2.2, codegen lowers component attributes based on it (the parameter's category,
TZS025/TZS026 — [language-reference.md](language-reference.md#component-attributes-by-parameter-type)).

**Manifests:** `@tsazor/runtime`, `@tsazor/components` and `@tsazor/fluent` generate
`dist/tsazor-components.json` at build time (`{ tsazorComponentManifest: 1,
package, components: { Tag: ComponentMetadata } }`, parameters already flattened, paths
package-relative; `package.json` → `tsazor.components` and the export
`./tsazor-components.json`) using the same extractor
(`buildPackageManifest`/`buildRuntimeManifest`). Consumers read the manifest instead of
parsing sources. The runtime manifest is additionally embedded in `@tsazor/workspace`
(`runtime-manifest.generated.ts`, generated by `scripts/gen-runtime-manifest.mjs`), so that
built-ins are known without an installed runtime (bundled language server, temporary
workspaces); `RUNTIME_COMPONENTS` is derived from it (concrete components), and
`RUNTIME_COMPONENT_PARAMS` is gone. Tests keep the embedded manifest in sync with the
runtime sources and with `getParameterInfo` of every built-in (names, order, capture,
cascading options).

**Cache and dependencies** (`MetadataCache`, shared as `defaultMetadataCache`): module
entries per file, stamped with the file's mtime+size, for `.tsazor` also with the
code-behind file (even while it is missing) and the `_Imports` levels; resolved components
are stamped with all files of the base chain and the package manifests that were read. An
entry is valid as long as all stamps match — a change to a component, its code-behind or a
base re-resolves exactly the dependent entries. For 4.1 (HMR) the edges are exposed:
`dependenciesOf(file)`, `dependentsOf(file)` (reverse edges) and `invalidate(file)`.
Limit: a newly created `_Imports.tsazor` further up does not invalidate on its own (4.1
calls `invalidate`).

### MarkupString (3.3)

Blazor's `MarkupString` (raw HTML): the runtime class `MarkupString` (`value`, `toString`) —
`RenderTreeBuilder.addContent` unwraps instances into markup frames (Blazor's
`AddContent(MarkupString)`), and the diff compares the `markupContent` text as Blazor does.
In the compiler, the markup expression node (`markupStringContent`) recognizes
`new MarkupString(inner)` and `inner as MarkupString` (the counterpart of C#'s
`(MarkupString)s`) via the TS parser and emits `addMarkupContent(seq, inner)` directly — no
instance object; the baked expression is the value. Recognition is tied to `collectImports`
(new: `runtimeBoundNames`, local → exported name per module specifier), so that only the
`@tsazor/runtime` name is rewritten — renames (`as Raw`) count, a local type of the same
name never does. Ordinary `@` expressions stay escaped (Blazor).

### Sections, HeadOutlet and FocusOnNavigate (3.4)

Blazor's sections and head management:

- `SectionRegistry` (sections/section-registry.ts, a port of Blazor's file of the same
  name): a provider list per identifier (`SectionName` string or `SectionId` object,
  `resolveSectionIdentifier` with Blazor's error messages), "last added wins" (default
  content stays at the front and loses), removing the last provider falls back to the
  previous one, removing a non-last one doesn't notify, exactly one subscriber per
  identifier (Blazor's error on the second). **Wired through the RenderHandle** as in
  Blazor (no global variable): the renderer owns `renderer.sectionRegistry` (one instance
  per renderer) and puts it on `renderHandle.sectionRegistry` in `createComponentState`;
  `SectionOutlet`/`SectionContent` read it from there — one registry per renderer; tests
  render the head and body roots through the same renderer.
- `SectionOutlet` renders the provider content through a nested component
  (`SectionOutletContentRenderer`), **keyed by fragment** (`b.setKey(fragment)` — Blazor's
  `SetKey(RenderFragment)`; port: `componentKey`/`setKey` accept arbitrary objects and the
  diff compares object identity). A changing provider ⇒ a fresh renderer instance
  (cascades/error boundaries for the new content); the same content ⇒ instances are kept.
- `HeadOutlet` (head/head-outlet.ts) as a second app root: `createTsazorApp` renders it into
  `document.head` (parity with the Blazor WASM host; the head root is torn down first on
  `dispose()`). A port of Blazor's JS `PageTitle.getAndRemoveExistingTitle`: on the first
  after-render, the static (prerendered) `<title>` is captured and removed — titles set by
  tsazor (preceded by a range marker; Blazor: logical-element map) are left untouched — and
  becomes the default content of the title section; with a PageTitle provider, the provider
  wins, and after it is removed the static title comes back.
- `PageTitle` (routing/page-title.ts) no longer sets `document.title` directly; it renders a
  `SectionContent` under `HeadOutlet.TitleSectionId` (Blazor 1:1); head content goes through
  `HeadContent` → `SectionContent(headSectionId)`.
- `FocusOnNavigate` (routing/focus-on-navigate.ts, a port of `FocusOnNavigate.cs` +
  `DomWrapper.focusBySelector`): a page change is detected via `routeData.route.type`
  (a sentinel class like Blazor's `NonMatchingPageType`); focusing happens in OnAfterRender
  via `focusBySelector` (without `tabindex`: `tabIndex = -1`,
  `focus({ preventScroll: true })`). Documented deviations: no render-mode mismatch check
  (no render modes), no `blazor-focus-on-navigate` custom element (Tsazor is always
  interactive), `isDefaultContent` as a normal parameter (no `IComponent.Attach` in Tsazor).

### EditForm (3.5)

forms/edit-form.ts, ported from Blazor's `EditForm.cs`:

- **Context management in onParametersSet** (as Blazor does there): `Model` XOR
  `EditContext` (identical error messages), a new context is created for a new `Model`,
  validators are only applied once the context exists. The `EditContext` parameter sets an
  externally owned context; no re-creation happens in that case.
- **Region per context identity:** the entire form subtree sits in a region whose sequence
  is Blazor's `_editContext.GetHashCode()` — ported as a counter in a
  `WeakMap<EditContext, number>` (GetHashCode can't be ported; the purpose stays the same: a
  stable identity per context instance). A new context ⇒ a different region sequence ⇒ the
  diff replaces the region entirely (input state is reset).
- **Fixed cascade:** EditForm is a `CascadingValueSupplier` with `IsFixed=true` — safe,
  because the region rebuilds the subtree on a context change before children read it
  (the same reasoning as in Blazor's source comment).
- **Submit:** the `onsubmit` handler is `EventCallback.bind(this, () => this.handleSubmit())`
  (`PreventDefault`); `handleSubmit` awaits `onSubmit`, or, after `validate()`, forwards to
  `onValidSubmit`/`onInvalidSubmit` — the await happens inside the tracked event handler,
  so `renderer.waitUntilIdle()` covers async submit callbacks.
- `authorize-view.ts`/`authorize-route-view.ts`: as in Blazor, `notAuthorized` is a
  `RenderFragment<AuthenticationState>` — slot context `@context` in `<NotAuthorized>`.

### Templated Components (2.3)

Slot vs. component is decided **before** tag resolution, from the parent's metadata
(`classifyChildContent` in codegen.ts): a direct child that names a
`RenderFragment`/`RenderFragment<T>` parameter of the enclosing component is a
child-content element (`slotElements`), even if a component of the same name exists —
Razor rewrites a `ChildContent` tag helper on the parent (`ComponentLoweringPass`) before
the component fallback. Without parent metadata, everything keeps the 2.2 behavior;
unresolved uppercase tags that look like slots get TZS025/TZS027/TZS028 here (in which case
TZS005 is not reported). Emission (`emitComponent`/`emitFragment`) sets each slot via
`addAttribute` under the canonical parameter name; `RenderFragment<T>` becomes
`(context) => (__builder) => {…}` — the context name comes from the slot's `Context`,
otherwise from the component's `Context` (a template attribute, consumed as in Razor
RZ10002), otherwise `context` — and is registered as body-local; the `@context` bind guard
knows the kind `context`. Type-argument attributes for the `@typeparam`s
(`TItem="Person"`) are consumed, and their value is checked for being a TS type via
`typeSyntaxError` (rewrite.ts). Whitespace between slots is not content; loose content next
to slots, duplicate slots, unknown slot attributes and non-fragment parameters used as
elements are TZS027/TZS028 — the message texts follow Razor's ComponentDiagnosticFactory
(RZ9995–RZ9999/RZ10002).

### Typed shadows, type service and tsazor check (2.4)

The type service (`@tsazor/lsp`, ts-service.ts) compiles every `.tsazor` into a
**shadow module** `<dir>/<Name>.tsazor.gen.ts` — virtual (an in-memory program, never on
disk). The shadow is the generated TS code plus type emission: `satisfies` prop checks per
component tag (value/`string` categories, metadata from the package manifest), typed slot
contexts from the `RenderFragment<T>` `typeArgument`, element `@ref` via an
`HTML/SVGElementTagNameMap` cast and component `@ref` via `ComponentReferenceCapture`,
runtime short refs through hygienic `alias()` names, import types through the
`rebaseTypeImport` hook. `TItem` inference goes through the type layer (4-pass
`buildEntry`: compile first, then unify `typedInference` requests per tag position, exactly
or via `TItem[]`). A component's shadows additionally export the class by name — named
imports in rewrite B (`@tsazor/fluent`) resolve against the shadows; the service
automatically ensures shadows of package `.tsazor` dependents (cascade across package
boundaries, cycle-guarded).

The check (`check.ts` in `@tsazor/lsp`) runs in two passes: pass 1 is compiler diagnostics
+ shadow construction for **all** `.tsazor` files under the project root (T4 — including
files that aren't open), pass 2 is TypeScript diagnostics over the complete shadow graph.
`@tsazor/cli` packages this as `tsazor check [root]` (exit 1 on errors), the Vite plugin as
`check: true` at the end of the build (and, non-blocking, in the background of the dev
server: `vite-plugin/src/dev-check.ts`). Per component, `componentTypeDeclarations`
(workspace/metadata.ts) writes a real `dist/<Name>.d.ts` from the package manifest (own
parameters with doc comments, a generic `@inherits` as a class generic, runtime types via
an `@tsazor/runtime` import); ambient declarations for `*.tsazor` and
`virtual:tsazor-routes` are provided by `@tsazor/vite-plugin/client`. Details:
[design-2.4-typed-checks.md](design-2.4-typed-checks.md).

### Project-wide LSP, slots and codemod (2.5)

**Project routing across all workspace folders.** The language server builds a
`ProjectRegistry` (`packages/lsp/src/projects.ts`) over every workspace folder; a file
belongs to the project of the **nearest** `tsconfig.json` above it (no tsconfig ⇒ the folder
root — previously: always `workspaceFolders[0]`, which distorted the app options in a
multi-app folder). Key convention: **project** keys are `` `${root}|${config}` `` — the same
tsconfig under two roots counts as two independent projects; **file** keys are the posix
path **+ lowercase** (normalized for Windows case-insensitivity), and the registry only
compares these keys. `didChangeWatchedFiles` is registered dynamically after Initialized
(`**/*.tsazor`, `**/tsconfig.json`): create/change refresh the on-disk shadow and re-check
the dependents (`dependentsOf` from the 2.4 import graph), delete removes the shadow; a
tsconfig change rebuilds the owning project (compiler options and lib resolution) and
re-publishes all open documents. After every edit of an open file, its own shadow is
rebuilt first, then the dependents are re-published — their cache is discarded, because
their component metadata also depends on the change. The v1 analysis of each open file
still compiles locally (`registry.rootOf` as the import root — the workspace folder, the
way the build sees the project); the TS layer comes via `registry.projectFor`.

**Slots as a separate classification module** (`packages/lsp/src/slots.ts`). The LSP
features (hover, completion) need the same slot logic as the compiler (2.3): an ancestor
chain (`chainAt`, outermost→innermost at the cursor), fragment parameters only from the
**direct** parent (`fragmentParametersOfParent` — a `<Row>` below a non-parent is TZS027,
not a slot), and the context name via an **inside→out** walk (an element's own `Context=`
value before the slot's, before the default `context`; only `RenderFragment<T>` parameters
and a generic `ChildContent` as loose content get a context variable). Hover on a slot tag
talks about the slot instead of a component of the same name; completion shadows
components with slot tags (the same binding order that the TZS025 rename fix requires).
Slot-body candidates are left out of completion (TZS027 nestings).

**Codemod core in the compiler** (`@tsazor/compiler`, `src/codemod.ts`). `codemodSource`
runs the A7 `fix` payloads to a fixed point (max. 8 passes) and additionally rewrites the
PascalCase API forms in markup (`.ToString()/.Length/.ToLower()/.ToUpper()` — outside
`@code`/`@functions`, whose blanked regions are remembered by
`markupRegions`/`blankCodeBlocks`). In each pass, fix edits and API forms are computed on
the same state and applied together via `applyTextEdits` (descending) — the fix wins any
overlap, and the API form follows in the next pass; a crash triggers a blanked re-run
(positions stay the same, fixes address the original). The consumer is
`tsazor codemod <path> [--write]` (`@tsazor/cli`, dry run by default, `.tsazor` written
next to the `.razor`); the same forms are the LSP quick fixes. Rules:
[language-reference.md](language-reference.md#codemod-razor--tsazor-25).

## HMR (state retention)

Every `.tsazor` file accepts its own updates:

```js
if (import.meta.hot) {
  import.meta.hot.data.previousDefault ??= Counter;
  import.meta.hot.accept((mod) => {
    const previous = import.meta.hot.data.previousDefault;
    import.meta.hot.data.previousDefault = mod.default;
    globalThis.__tsazor?.hmrSwap(previous, mod.default);
  });
}
```

`Renderer.hmrSwap(oldType, newType)` (called via `createTsazorApp`):

1. finds all ComponentStates with the old type and sets the new definition,
2. **keeps the instance objects**: a prototype swap to the new class; fields that the new
   constructor initializes and the old instance doesn't have are taken over from a fresh
   probe instance (state retention). With `[[Define]]` fields every declared field is an
   own property — even without an initializer; a field that the new version turned into a
   getter/setter is therefore removed from the instance (otherwise it would shadow the
   accessor). After the swap, the parameter metadata comes from the new class,
3. triggers `stateHasChanged` — the new `buildRenderTree` diffs against the existing DOM.

The diff also tolerates hot swaps during parent re-renders: frames with the same class name
whose module was hot-swapped (`wasHmrSwapped`) are taken over **in place** instead of being
remounted.

**Invalidation (4.1):** the dev-server hook (`hotUpdate` in Vite ≥ 6, `handleHotUpdate`
compatibility in Vite 5) goes beyond plain import edges: `_Imports.tsazor` is not a module,
unresolved tags (TZS005, now in `metadata.unresolvedTags`) don't embed an import, and the
consumers' codegen depends on the target's parameter metadata (2.1/2.2). The plugin records
these three kinds of edges per transformed file (`TransformRegistry`,
`packages/vite-plugin/src/invalidate.ts`) and turns every watch change into a semantic plan
(`planInvalidation`): a new component ⇒ re-transform the files that previously had an
unresolved tag; an `_Imports.tsazor` change ⇒ all files below it; sidecars
(`.tsazor.css`/`.tsazor.ts`) ⇒ the owner (± consumers); `@page`/`@layout` added or removed
⇒ the route manifest module (`virtual:tsazor-routes`, whose chain reaches up to
`index.html` and triggers the reload). Paths are normalized case-insensitively for Windows
(`normalizeFileKey`); the scan stays limited to `src`. On the module graph: Vite ≥ 6 only
invalidates environment modules — so the hook uses `server.environments.client.moduleGraph`
(the legacy `server.moduleGraph` wrappers throw on invalidation); Vite 5 goes through the
compat path. A full reload happens only where HMR can't lie: on manifest changes
(automatically via the module chain) and when a CSS sidecar is removed (the injected
`<style>` doesn't survive HMR). When a loaded file is removed, Vite's client runs once
against the vanished module (404 / "Failed to reload") before the consumers' swap lands —
limited, documented noise. Live verification: `apps/demo/scripts/verify-hmr.mjs` runs the
scenarios (a) new page, (b) component for a previously unresolved tag, (c) edit swap with
state retention, (d) `_Imports` import, (e/f) CSS sidecar added/removed, (g) component
removed, against a real server.

**Documented limits:** route display (layout changes, authorization) depends on the route
manifest — every `@page`/`@layout` change causes a full reload; only markup/code changes
are hot-swapped. Parameter additions that require re-instantiation fall back to best
effort — if the state looks wrong, reload the page.

## Error overlay

Compiler errors (`TZS001…` with position) are thrown by the transform hook as located
errors — Vite's dev server shows them in its standard overlay; warnings appear on the
console.
