# API review before the 1.0 freeze

Status: **2026-10-14, for the owner's decision.** The basis for the freeze (roadmap step "API review", after E3 and
E10). Five reviews of the snapshots in `api/` — the runtime; @tsazor/ui; the two skins against each other; the tools
(compiler, workspace, lsp, cli, vite-plugin); dotnet, testing, charts, worker and markdown. Every finding was checked in
the source and its usages counted (`apps/`, `packages/`, without node_modules, dist and .backend); the behavioral ones
were run (the CLI's exit codes, a strict `tsc` over generated code, `isolatedModules`).

## The picture

The layer apps program against is in good shape: the components and their parameters, the decorators, DI, forms,
navigation, localization, `HttpResult`, the auth providers, the skins' ~85 shared components, the behaviors, the
QuickGrid-shaped grid types, `render`, `defineWorker`, the vite plugin's options. No `any`, no `Function`, option
objects almost everywhere.

The risk is **breadth**, not design. The snapshots are 8,365 lines, and much of that is plumbing that nobody outside
Tsazor uses but that 1.0 would freeze: the renderer and the diff, ComponentBase's bookkeeping, ~180 compiler,
workspace and lsp exports that change weekly, ~110 per-component helpers in @tsazor/ui, the generator's internals.
Some contracts that matter aren't in the snapshot at all: what generated code calls (an ABI third-party libraries
depend on), the component manifest format, the CLI's exit codes, parameter defaults, ambient modules.

So the freeze takes four steps, mostly deletion and renaming:

1. **A policy that says what the promise covers** (Part 1): public, ABI, internal. That alone takes most of the
   surface out of the freeze, safely, because every package ships in lockstep with exact internal versions
   (D-P1, D-P6).
2. **Cheap now, breaking later** (Part 2): hide, remove, rename. No real trade-offs; recommended in full.
3. **Decisions** (Part 3): about a dozen with real alternatives.
4. **Gates** (Part 4), so that what is frozen stays frozen.

Bugs the reviews found on the way (fix regardless): see Part 5.

## Part 1 — What the promise covers (proposed as D-S7 in [support-policy.md](support-policy.md))

| Tier | What | Rule |
|---|---|---|
| **Public** | runtime's app layer (components, decorators, DI, forms, navigation, localization, auth, HTTP); the skins' components; ui's behaviors, services, models, vocabulary, texts, icons; dotnet's `HttpResult`, auth providers, `OpenApiClient` and the generated client's conventions; testing; charts' and markdown's components; worker's `defineWorker`/`exposeWorker`/`inProcessWorker`; the vite plugin's `tsazor()`, its options, `/client` and `virtual:tsazor-routes`; the CLI's commands, flags, exit codes and output line; the TZS codes, their meaning and default severity | the stability promise; changes per [support-policy.md](support-policy.md) |
| **ABI** | what compiled `.tsazor` code calls: RenderTreeBuilder's methods (`reuseKeyed` included), `EventCallback.bind`/`bindWith`, `bindMethod`, `addAttachment`/`addTransition`/`addAnimate`, `formatValue`/`parseValue`, `inject`, the decorators, ComponentBase's hooks; the component manifest (`tsazor-components.json`) | a library compiled with 1.x runs on every later 1.y runtime: additive only, a changed protocol gets a new name; a library's runtime peer floor is the version it was built with |
| **Internal** | the programmatic APIs of compiler, workspace and lsp; a new `@tsazor/runtime/internal` (frames, diff, ComponentState, DomRenderer, Dispatcher, RenderHandle); a new `@tsazor/ui/kit` (the per-component helpers) | released in lockstep, may change in any minor; snapshotted with an "internal" header, no CHANGELOG duty; the copy-in CLI pins `@tsazor/ui@<exact version>` |
| **Not stable** | diagnostic message texts; TypeScript's own `TSnnnn` codes; the scoped-CSS attribute value; the shadow file names; `uniqueId()`'s format; markdown's exact HTML; the third-party versions an install resolves | stated as such |

Growth rules the promise needs, because D-S1 counts every new `tsazor check` error as breaking:

- **Literal unions may gain members in a minor** (`Intent`, `Size`, `RenderErrorPhase`, `CultureChangedEventArgs.reason`,
  `TreeKeyAction`, …): code that switches over one handles a default. Otherwise every new intent or key action waits for
  a major.
- **Contracts that libraries implement gain only optional members** (`SortableListHandle`, `GridColumn`,
  `FileUploadCallbacks`, `CascadingValueSupplier`, `AuthenticationStateProvider`'s overridables).
- **ComponentBase gets no new public members in a minor** — TZS031 rejects a `@code` member of the same name. Better:
  Part 2, R1, which keeps the plumbing out of the members' namespace.

Mechanism: `"tsazor": { "api": "internal" }` in a package.json (or per `exports` entry); `api-snapshot.mjs` writes the
header and drops the CHANGELOG requirement; the READMEs say the same (workspace's already does, compiler's contradicts it).

## Part 2 — Cheap now, breaking later (recommended in full)

### runtime

| # | What | Why | Uses outside |
|---|---|---|---|
| R1 | ComponentBase's plumbing (`renderHandle`, `stateHasChangedInternal`, `pendingRender`, `isInitialized`, … 18 members) behind `#private`/symbols; the libraries call `stateHasChanged()`; testing gets an internal hook | TZS031 takes these names from users; any member added later breaks checks | `stateHasChangedInternal` in 16 skin/gallery components (28 calls), testing 2× |
| R2 | `@tsazor/runtime/internal` for the renderer machinery; a narrow public `Renderer` (constructor, `renderInContainer`, `disposeComponent`, `waitUntilIdle`, `errorHandler`); `RenderError.component` the component, not its ComponentState | frames and diff will change (render hints, SSR); Blazor calls its RenderTree types internal | 0 in apps; testing, tests |
| R3 | `FrameType`, `EventHandlerFlags`, `RenderTreeEditType`: real enums or `as const` objects instead of `declare const enum` | TS2748 under `isolatedModules`, i.e. in every Vite app (checked with tsc 5.9.3) | — |
| R4 | Remove the pre-1.0 aliases: `NavLink.cssClass`, `Virtualize.itemTemplate`/`overscan`, `NavigationOptions.replace`, `LocationChangedEventArgs.isIntercepted`, `NavigationManager.toAbsolute`, `EditContext.subscribe`, the `{ singleton }` option (quick fixes for `singleton`, `cssClass`) | D-S4 would keep each for all of 1.x | `singleton` 15 in 12 files; `cssClass` 4; others ≤ 1 |
| R5 | Plumbing on app-facing classes → `#private`/module functions: NavigationManager's holds and `setNavigationLock`; EditContext's field-state members; Virtualize's mutable `@internal` fields; ServiceProvider's constructor; `peekState`/`notificationVersion` | 88 `@internal` tags ship, nothing strips them | 0 in apps |
| R6 | `#private` instead of TS `private` in classes apps extend (AuthenticationStateProvider, InputBase, ErrorBoundaryBase); InputBase's builder helpers as module functions | a TS-private name in the .d.ts collides with a subclass's (TS2415): a user's `private version` doesn't compile; adding one in a minor breaks | 20 auth providers, 34 inputs |
| R7 | Export the 21 reachable but unexported types the apps use (`TsazorApp`, `ValidationMessageOverride`, `FieldRuleDecorator`, …); `EventSet` as `EventSubscription<H>` without a public `invoke` | apps can't name them; the snapshot doesn't see their changes | `app.services` in blazorhero |
| R8 | Zero-use helpers to `/internal` (sections, route table, `focusBySelector`, `watchAuthenticationState`, …); remove `IErrorBoundary`; `defineParameter` gets its own narrow options type; `defaultAuthorizationService` is no exported mutable singleton | freeze or leak | ≤ 1 (tests) |

### @tsazor/ui

| # | What |
|---|---|
| U1 | `@tsazor/ui/kit` for the ~110 helpers only the skins use (Part 1); copy-in pins the exact version |
| U2 | Remove the six English label constants, `openLayer`, `isTopLayer`, `builtInIcons` (and the skins' `Icon.name`, deprecated, 0 uses); make `new DialogReference` and `PaginationState.setTotalItemCount` non-public |
| U3 | The Async rule (2026-10-11) for 8 methods: `ChipSetModel.click`/`close`, `DataGridModel.provideRange`, `SearchRunner.run`, `SortableListHandle.move`/`remove`/`add`, `Toaster.act` |
| U4 | Names: ui's `Toast` → `ToastEntry`, `Hotkey` → `KeyCombination` (the skins use both names for components); `dismissable` → `dismissible` (the skins' spelling); `FileUploadErrorEventArgs.errorCode` in kebab case, the only PascalCase value union |
| U5 | Shapes: `scrollLock` and `topLayer` as factories like every other behavior; `createLayer()` returns an opaque `Layer`, not `object`; `raiseInTopLayer`'s counter internal; `libraryTextDefaults` typed `string`, not its English literals; `GridItemsProviderResult.items` readonly |

### The skins

| # | What |
|---|---|
| S1 | `Toast`: a Bootstrap component with Fluent's parameters; the type no longer re-exported under that name |
| S2 | Cascading members (`Tab.owner`, `MenuItem.menu`, `Tab.tabs`, … 15) out of the declarations: the compiler calls them "not settable from markup", and their names differ per skin |
| S3 | `Form.validators: Record<string, ModelValidator>` (today `unknown`); bootstrap's `NumberInput.min/max/step` as `number \| null` like Fluent's (FluentCMS's port fails under Bootstrap) |
| S4 | `OptionsSearchEventArgs` once, in ui (the dist .d.ts imports a shipped `.ts` source today); one re-export list derived from the referenced types (13 types are missing, apps import ui for them) |
| S5 | Naming: Wizard's `labelPrevious`/`Next`/`Done` → `labels`; Skeleton's `"circle"` → `"circular"`; Table's `compact` → `small` (as DataGrid) |

### The tools

| # | What |
|---|---|
| T1 | vite-plugin's root exports only `tsazor`, `default`, `TsazorPluginOptions` (13 internals today, typed against a devDependency — `any` under `skipLibCheck`) |
| T2 | CLI: an unknown option or a missing root exits 2 (today `tsazor check ./typo` and `tsazor check --json` print "0 file(s)" and exit 0 — a vacuous green gate); one exit-code table (0 clean, 1 findings, 2 usage/setup), `--help` 0, fatal errors on stderr; drop `main` and `findRazorFiles` from its exports |
| T3 | One diagnostic prefix: `TSZSTRICT`, `TSZECHECK`, `TSZE000` become TZS codes in the catalog (the letters are transposed today); the retired TZS007/TZS010 out of `DiagnosticCode` |
| T4 | `virtual:tsazor-routes` typed `readonly RouteManifestEntry[]` (lazy entries have no `type`) |
| T5 | `staticMarkup` and `renderHints`: the docs call them temporary ("an escape hatch for one release"); remove before 1.0 and keep `optimize`, or keep them for 1.x and change the docs |
| T6 | Plugin compile errors in the check's line format (`file(line,column) CODE message`, 1-based; today 0-based and a different order) |

### The satellites

| # | What |
|---|---|
| X1 | dotnet: unexport the HTTP helpers (`buildResult`, `sendForResult`, `unwrapEnvelope`, …) and the generator's internals (`main`, `flattenAllOf`, `resolveSchemaRef`, …; one refers to an unexported type) |
| X2 | dotnet: `JwtClaims` as JSON values (booleans, objects, arrays exist in real tokens; an object claim becomes `"[object Object]"`); it's the parameter of the `createUserAsync` apps override |
| X3 | charts: don't export the chart math (9 functions, positional parameters, `chartSummary` with English sentences) — adding later is additive |
| X4 | worker: unexport `WorkerConnection`; rename `WorkerOptions` (shadows lib.dom's); `WorkerProxy` maps the reserved names (`terminate`, `dispose`, `then`) to `never` |
| X5 | testing: `RenderResult`'s fields readonly; a check that testing's own names never collide with the runtime's (its `export *` lets them shadow silently) |
| X6 | markdown: `externalLinks: "new-tab" \| "same"` → `"same-tab"`, if at all |

## Part 3 — Decisions for the owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | `InputBase.Value`/`ValueChanged`/`ValueExpression`, `ValidationMessage.For`, `LayoutComponentBase.Body` are PascalCase, against the camelCase rule (design-principles, 2026-10-01) | rename all (codemod; attributes match case-insensitively) · keep all as named exceptions | rename the first four (`this.Value` in 29 files, a codemod); keep **`Body`** as a named exception — layouts read it as `@Body` in markup, Razor 1:1 |
| D2 | Field identity in forms: fields are keyed by the binding's *last* member name, so `billing.street` and `shipping.street` share one validation state; Blazor 10+ validates nested models | the full member path as the key now · `FieldIdentifier` objects | the full path (a string stays simple; nested validation can come in a minor); remove the unused `FieldIdentifier` |
| D3 | Event vocabulary: `addLocationChanged((sender, e) => …)` is .NET's pattern; disposal is `{ dispose() }` in two places, `() => void` elsewhere | align now · keep | align: no `sender`, `() => void` everywhere, NavigationManager a `Subscribable` (fullstackhero wraps it by hand 4×) |
| D4 | Dates and numbers format with `<html lang>`, the texts with `CultureService`: German labels, US dates | CultureService first · page `lang` first | CultureService (Blazor's CurrentCulture), then the page's `lang` |
| D5 | Default `intent` differs between the skins: Button and Menu `secondary` (Fluent) vs `primary` (Bootstrap), Badge the other way round; switching skins changes half the buttons | one cross-skin default · each design system's own | one default, Fluent's (the skins promise a one-line switch) |
| D6 | `Table` is two different components (Fluent: generic with `items`/`rowContent`; Bootstrap: a wrapper with `childContent`) | one shape, the union of both · two names | one shape in both skins; the type parameter named `TItem` |
| D7 | `FluentProvider.tokenOverrides: Record<string, string>` makes 378 token names public, untyped | a typed, curated `FluentToken` set · declare the tokens not covered | a typed set (brand ramp + semantic tokens), the rest internal |
| D8 | ui's helpers | `/kit`, not covered (U1) · freeze them after reshaping | `/kit` |
| D9 | Third-party libraries can only be built through six internal functions (four copies of `build-entry.ts`) | one façade (`buildLibrary(…)` or `tsazor build-lib`) · freeze the six | the façade, before 1.0 — "open for external libraries" |
| D10 | The component manifest crosses versions (a library's tools 1.x, the app's 1.y); its version field is never read, a bad file fails silently (TZS005) | write the rules · leave it | rules: only optional fields in 1.x, unknown fields ignored, a newer version a diagnostic; a 1.0 fixture test |
| D11 | `TSZSTRICT` is a warning, though strict is "the only supported configuration" | an error · word the promise around it | an error, now (later it is breaking) |
| D12 | `AuthorizationService`: synchronous `(user) => boolean` policies in a public mutable record; Blazor's `AuthorizeAsync` is async and resource-based | async-capable now (`boolean \| Promise<boolean>`, `addPolicy`) · synchronous is final | async-capable now |
| D13 | The generated .NET client: names derived from paths change when an endpoint is added; no per-call slot for `AbortSignal`/headers; header parameters dropped silently; B4 open | reserve and document now · leave | reserve a trailing `options?: { signal?, headers? }`, document the naming algorithm as the contract, warn on header parameters, settle B4 |
| D14 | `HttpResult`: status errors are values, but network errors and aborts reject — the doc says "neither throws" | document today's behavior · fold them into `{ ok: false, status: 0 }` | document today's (fetch's and HttpClient's behavior) |
| D15 | `Toaster` next to `DialogService` (Blazor developers look for a `ToastService`) | rename · keep · alias | keep, with a migration note (27 files and a tutorial chapter use it) |

## Part 4 — Gates, so the freeze holds

- **The snapshot sees more:** it fails when a public signature names an unexported type (21 in the runtime, more in the
  tools), prints ambient `declare module` blocks (`virtual:tsazor-routes` isn't snapshotted), keeps `@deprecated` and
  `@internal` visible, and marks internal packages.
- **Skin parity:** a CI check diffs both skins' `tsazor-components.json` (parameters, types, defaults) against an
  allowlist of intended extras. Today a parameter one skin lacks falls through silently as an HTML attribute
  (`ariaDescribedBy` on Bootstrap's Button, Badge's `appearance`, …), because TZS025 doesn't fire on components that
  capture unmatched attributes.
- **The ABI:** a test pins the runtime members codegen emits against the declared ABI list.
- **Bins:** the pack check smoke-runs every package's bin and server entry (it would have caught the lsp server in
  Part 5).

## Part 5 — Bugs found on the way (fix regardless)

- dotnet: `queryString` takes `string[]` only; an `integer[]` query parameter generates code that fails strict `tsc`
  (TS2345).
- lsp: `@tsazor/lsp/server` can't run from an npm install (its `vscode-languageserver` packages are devDependencies, and
  it has no `bin`), though the README tells other editors to start it.
- vite-plugin: the root entry's types refer to `@tsazor/compiler`, which isn't a dependency (T1).
- ui: `scrollLock` doesn't compensate the scrollbar's width, so Bootstrap's Dialog shifts the page on Windows.
- charts: their texts (`"Chart"`, `"The data"`, the screen-reader summary) aren't in the library texts (`tsazor.ui.*`).
- the bootstrap skin lacks `ariaDescribedBy` (Button) and `ariaLabel` (Card) that Fluent has — accessibility lost
  silently.

## Effort and order

Parts 1 and 2 are a few days of mechanical work; R1 and R2 are the largest (ComponentBase and the renderer's exports
touch the skins' compiled output and @tsazor/testing). Suggested order: the policy (Part 1, after the owner's word on
D-S1…D-S7) → runtime R1–R8 → ui and the skins → the tools → the satellites → the gates → the decisions as decided. Every
step keeps `pnpm gates` green and updates the snapshot with a CHANGELOG entry, as now.
