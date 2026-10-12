# Port Findings: Blazing Pizza → Tsazor

Result of the first port of a real, non-trivial Blazor app
(dotnet-presentations/blazor-workshop, MIT) to Tsazor. The port covers:
specials grid, pizza configurator, checkout with address validation, MyOrders,
OrderDetails with polling + Leaflet map, auth (login/logout/registration),
status progression (Preparing → Out for delivery → Delivered).

**Result:** The complete flow runs end to end (`apps/blazing-pizza/scripts/verify-pizza.mjs`,
19 checks, zero console errors). Two gaps were closed on the compiler side
(@authorize, knownGlobals); the rest are documented deviations/workarounds.

---

## A. Framework gaps uncovered by the port (closed on the compiler side)

### 1. `@authorize` directive was missing — **fixed, added**

Blazor pages protect themselves with a bare `@authorize` directive; the Tsazor compiler
did not know it.

**Fix:** `packages/compiler/src/parser.ts` (`authorize` in `DIRECTIVE_NAMES`),
`codegen.ts` (`metadata.authorize` → `export const routeAuthorize = true` +
static class members), `packages/vite-plugin/src/routes.ts` (manifest entry
`authorize: {}`). Regression-tested in compiler + vite-plugin. Semantics like
Blazor's default policy: authenticated = authorized.

### 2. Runtime enums in markup were baked to `this.*` — **fixed, added**

`Match="@NavLinkMatch.All"` in markup compiled to `this.NavLinkMatch.All` —
but `NavLinkMatch` is an imported runtime enum, not a component member.
`bakeMemberRefs` bakes *every* free identifier to `this.*`, because at
compile time it cannot tell what will later be imported via `collectCodeImports`.

**Fix:** New codegen option `knownGlobals?: ReadonlySet<string>`; the
vite-plugin transform pre-scans the source for `RUNTIME_TYPES` identifiers
and passes them in. Regression-tested (vite-plugin).

**State A3 (2026-09-30):** `knownGlobals` and the pre-scan are removed; `NavLinkMatch`
comes via `@import` from the standard set in `_Imports.tsazor` and therefore stays free.

### 3. Async lifecycle hooks do not render after the `await` — **fixed (B4), workaround removed**

*Correction:* The original description was wrong on both counts. Tsazor awaited
async `onInitialized`/`onParametersSet` and rendered **once at the end** — without a
loading state (review R6). And Blazor does **not** behave this way: `ComponentBase` renders
while the hook's task is running (after its synchronous part), and again after completion
(`RunInitAndSetParametersAsync` / `CallStateHasChangedOnAsyncCompletion`); the originals
of `Index`, `MyOrders` and `ConfigurePizzaDialog` do not call `StateHasChanged` there. The
"stuck in loading" symptom probably came from work outside the hook's task (fire-and-forget), which
also needs an explicit `StateHasChanged` in Blazor.

**State (B4):** Tsazor renders like Blazor (loading state + render after completion). The
`stateHasChanged()` calls after the awaits in `Index`, `MyOrders` and
`ConfigurePizzaDialog` are removed; `OrderDetails` keeps its call — its poller runs
fire-and-forget from `onParametersSet`, as in the original (`PollForUpdates` + `StateHasChanged`).

## B. Syntax rules the port confirmed (reminder, no fix needed)

| Topic | Rule |
|---|---|
| Component event attrs | Proven form: `OnSelect="@(() => fn())"`. `@() => ...` **without** outer parentheses is broken (parses as an explicit expression + text). |
| Element handlers | Lowercase `@onclick="handlerName"` (bare name) or `@onclick="@(() => ...)"`. PascalCase element attrs work too. |
| `@foreach` | *Superseded (A6a):* the header is TypeScript — `@foreach (const x of y)`; the C# form `@foreach (var x in y)` is error TZS021 with this TS form ([language-reference.md](language-reference.md#code-contexts-code-first-like-razor)). |
| `@@` escape | `@@` escapes the @: `placeholder="test@@example.com"` (plain `@example.com` parses `@example` as an expression). |
| `<text>` tags | Supported (textTag node). |
| `@inject` | Only at document level, **never** inside `@code` (otherwise esbuild error `Expected ";" but found ...`). |
| `@bind` on `type="range"` | Does not coerce to number — a manual `@oninput` handler with a `Number()` cast is needed. |

## C. bakeMemberRefs / free functions — workaround pattern

All markup/code expression identifiers that are not locals, arrow params,
KNOWN_GLOBALS, JS keywords or after-dot accesses are baked to `this.X`
— **including imported free functions** (`@orderFormattedTotalPrice(...)`
→ `this.orderFormattedTotalPrice` = undefined).

**Workaround (in the app):** `PizzaComponentBase.ts` — a base class that binds the
helpers as `protected readonly` members; all pages/components use
`@inherits PizzaComponentBase`. This is even Blazor-idiomatic
(corresponds to a shared base class there).

**Open question for the framework:** Should `collectCodeImports` also recognize free
functions from `.ts` files and feed `knownGlobals`? Currently
it only scans PascalCase identifiers (types/components).

**State A3 (2026-09-30):** answered by explicit imports — the helpers (and
`PIZZA_MINIMUM_SIZE`/`PIZZA_MAXIMUM_SIZE`) are listed as `@import` in the app's `_Imports.tsazor`,
`PizzaComponentBase` is removed.

**State A4 (2026-09-30):** Section obsolete. `bakeMemberRefs` has been replaced by rewriting over the
TS AST with scope analysis (`packages/compiler/src/rewrite.ts`); imports, locals and
JS/DOM globals (from TypeScript's `lib.d.ts`) stay free, declared members become `this.X`.
Neither the base-class nor the free-function workaround is needed.

## D. Documented deviations from the original

| Original | Tsazor port | Reason |
|---|---|---|
| ASP.NET Core server + EF/SQLite | `server/server.mjs` (node:http, zero deps, in-memory) | Port test case; REST contract 1:1 |
| ASP.NET Identity + OIDC (RemoteAuthenticator) | Cookie session auth: `POST /auth/register\|login\|logout`, `GET /auth/user` | OIDC would be a project of its own; AuthProvider integration is the test goal |
| `GET /auth/user` anonymous → 401 | → `200 { user: null }` | Keeps the browser console error-free at app start (E2E gate: zero console errors) |
| DataAnnotations (`[Required]`, `[MaxLength]`) | Functional `ModelValidator` map in the `@code` block | No reflection in TS; see `Checkout.tsazor` |
| BootstrapFieldClassProvider | 2–3 CSS rules in `wwwroot/css/site.css` that map Tsazor's `invalid`/`modified valid` classes to Bootstrap colors | No provider concept needed |
| ComponentsLibrary Map (JS interop + Leaflet) | `Map.tsazor` imports Leaflet **directly** via npm (`await import("leaflet")`) | Tsazor IS JS — no interop needed; the biggest single win of the port |
| Push notifications (VAPID/service worker) | **skip** (PUT/GET /notifications contract is honored, subscription only in memory) | A project of its own; no test value for the framework |
| GraphQL special offers (workshop module 6) | **skip** | Likewise a project of its own |
| LocalStorage/geolocation via JS interop | Direct `window.*` access in the `@code` block | ditto |

## E. What worked smoothly (Blazor parity confirmed)

- `@page` + Router + `NavLink` + layouts + `@layout`
- `AuthorizeRouteView` / `AuthorizeView` / `AuthenticationStateProvider`
  (provider registered under two DI tokens: concrete class + base class)
- `EditForm` + `Validators` + `ValidationMessage For="name"` (per field on submit)
- `EventCallback` (child → parent, receiver re-renders after invoke — poller/dialog flow)
- Cascading `OrderState` service via DI (state change → re-render of the consumers)
- Route parameters with a constraint (`@page "/myorders/{orderId:int}"` → `@Parameter() orderId!: number;`)
- Dynamic npm import in `.tsazor` (`await import("leaflet")` + CSS import)

## F. Verification

- `apps/blazing-pizza`: `node --test test/` (status engine, 5 tests) +
  `node scripts/verify-pizza.mjs` (19 E2E checks, headless Edge, zero console errors)
- Framework regressions: all package tests stay green (compiler, runtime,
  workspace, testing, lsp, vite-plugin, components)

---

# Dogfooding: Tutorial app (`apps/tutorial`, M1) → Tsazor

The interactive tutorial shell (top bar, lesson menu, text, file tabs, CodeMirror editor,
problems panel, preview iframe) is written entirely in `.tsazor`; in addition, the
compiler pipeline runs **in the browser** (web worker). Findings:

## G. Framework gaps (minimally closed in the package)

### 1. Scoped CSS selector logic depended on postcss + `node:crypto` — **moved**

`scopeSelector` was pure string logic, but lived in `packages/vite-plugin/src/scoped-css.ts`
next to postcss and `createHash`. A browser host could not import it.
**Fix:** moved to `packages/compiler/src/scoped-css.ts` and exported from `@tsazor/compiler`;
the Vite plugin imports and re-exports it (tests unchanged and green). The
stylesheet walk (rules, `@media`, `@keyframes`) is done in the browser by a small dedicated walker
(`apps/tutorial/src/engine/scoped-css.ts`) — postcss stays plugin-only.

### 2. `@tsazor/workspace` is only usable via `node:fs` — **partial fix, rest open**

The built-in lists (`RUNTIME_COMPONENTS`, `RUNTIME_TYPES`, `RUNTIME_MANIFEST`) are pure
data, but were only available through the index, which pulls in `node:fs`/`node:path`. **Partial fix:** new
subpath export `@tsazor/workspace/builtins` (Node-free; `RUNTIME_MANIFEST` re-exported there).
**Open:** the actual resolution (enclosing folders, `@using` sources, ambiguity,
`_Imports` chain, metadata host) is tied to the file system; the tutorial duplicates
the rules in memory (`apps/tutorial/src/engine/resolve.ts`, ~250 lines). Proposal: a
`FileSystemHost` interface (`exists`, `read`, `list`) in `createFileContext`/`MetadataCache`,
with the Node implementation as default — then plugin, LSP and browser hosts share *one*
resolution (playground, tutorial, later a REPL).

## H. Friction (documented, no fix needed)

### 3. `@if` narrowing does not reach deferred ChildContent

```razor
@if (current && text) {
    <PageTitle>@text.title</PageTitle>   @* tsazor check: TS2532 'possibly undefined' *@
}
```

The body of `<PageTitle>` is a `RenderFragment` (a lambda, rendered later) — TS discards
the narrowing of `this.text` inside it. Surprising for learners; workaround: a getter
(`pageTitle`) or a local via `@{ const t = text; }` before the tag.

**Fixed 2026-10-10 (F15).** The note above said C#/Razor nullable analysis behaves similarly in
lambdas. It doesn't: a Razor class library (.NET 10, `Nullable` on) builds `@if (Node != null) {
<Card>@Node.Name</Card> }` without a warning, for a property, a field, `Node?.Child`, a template
with `context` and a `@bind-Value`; C# reads a lambda in the state where it stands. `tsazor
check` now does the same for the functions the compiler makes (fragments, bind setters): the
shadow calls them in place (codegen `deferred()`). A lambda the author writes keeps
TypeScript's rule.

### 4. `tsazor check` without a path also checks sample projects in the app folder

`tsazor check` (root = app) found the lesson files under `content/` and reported TZS005
(`<Nested>` in `app-b/` only exists in `app-a/`). There is no exclude; workaround
`tsazor check src`. Proposal: `check` respects `tsconfig.include`/`exclude` or an
`--exclude` glob.

### 5. Embedding imperative widgets: good, with one rule

CodeMirror and the preview iframe hang cleanly on the component lifecycle via `@ref` + `onAfterRender(firstRender)` +
`dispose()` (the Blazor pattern with JS interop, here without
interop). Callbacks from non-Tsazor events (postMessage, editor updates) need
`this.stateHasChanged()` or an `EventCallback.invokeAsync` — like Blazor's
`InvokeAsync(StateHasChanged)`. Worked without a workaround.

### 6. The component type for `@ref` needs an explicit `@import`

`<CodeEditor @ref="editor" />` resolves via `@using ./Shell`, but the field
`private editor?: CodeEditor;` still needs
`@import CodeEditor from "../Shell/CodeEditor.tsazor"` for the *type* (tag resolution ≠ name in code — documented
that way, but a stumbling block). The shadow could give an `@ref` field without an annotation
the resolved tag type.

### 7. Outlook (not hit in M1, noted for M3)

The preview runs as a `srcdoc` iframe with an opaque origin (`sandbox="allow-scripts"`). For the
routing lessons (`@page`, `NavLink`, `navigateTo`), `history.pushState` will
probably fail there (about:srcdoc). Option: a NavigationManager with in-memory history
(the constructor already takes a `historyApi`) — generally useful for previews/tests.

## I. What worked smoothly

- The compiler runs unchanged in the browser (worker): only `typescript` + `@jridgewell/*`,
  no Node APIs — `compile()` + `extractTsazorMetadata` + `resolveComponentMetadata` with
  a custom `MetadataHost` are enough for parameter metadata, TZS025 & co.
- `typescript.transpileModule` instead of esbuild lowers the standard decorators correctly;
  the runtime's `Symbol.metadata` polyfill kicks in.
- Source maps: compiler map + TS map chained ⇒ runtime errors in the preview show
  `App.tsazor:5:9` (checked by E2E).
- Router with route parameters (`@page "/{track}/{slug}"`), `PageTitle`, scoped CSS +
  `::deep` for foreign DOM (CodeMirror, iframes, Markdown HTML), `MarkupString` for the
  lesson text, a DI singleton for the tutorial state.
---

# Dogfooding: Tutorial M2 (Part 1, chapters 2–7) → Tsazor

The 27 new lessons (state, parameters, logic, events, bindings, styles) pinned down every
claim of the lesson text as a test against compiler, runtime and type check
(`apps/tutorial/test/claims-part1.test.ts`). Along the way we noticed:

## J. Framework gaps (fixed, with tests)

### 1. `ComponentBase` bookkeeping collided with component fields — **fixed**

`ComponentBase` kept its lifecycle state in TS `private` fields (`initialized`,
`hasPendingRender`, `firstRenderDone`, …). TS `private` is compile-time only: a
component field `initialized = "no"` overwrote the flag, `setParametersAsync` considered the
component initialized and **never called `onInitialized`** (the type check reports
TS2415, the build does not). In Blazor, private base fields never collide. **Fix:** real
`#private` fields/methods in `component-base.ts` (only used there). Test:
`runtime/test/lifecycle.test.ts` ("ComponentBase's own state is invisible"). Residual risk:
`renderHandle`/`componentServices` remain public (`@internal`) names.

### 2. `@onclick="() => count++"` failed the type check — **fixed**

`EventCallback.bind` required `(arg) => void | Promise<void>`. The TS rule "every
return type is `void`-compatible" only applies to plain `void`, not to the union — every
lambda with a value (`() => count++`, `() => show = !show`, Blazor's standard example) was
TS2345 in `tsazor check`/LSP. **Fix:** delegate type `(arg) => unknown` (the runtime only waits
for real promises anyway). Pinned in `claims-part1` ("inline-handlers").

### 3. `@attributes` with an unset capture parameter — **fixed**

`addMultipleAttributes(seq, undefined)` threw at runtime (`Object.keys(undefined)`) —
i.e. every component with `captureUnmatchedValues` to which the parent passes *no* extra attributes.
The type also required `Record<string, AttributeValue>`, so the usual
`attributes?: Record<string, unknown>` was TS2345. **Fix:** Blazor semantics (null/undefined
adds nothing), parameter type `Readonly<Record<string, unknown>> | null | undefined`.
Test: `runtime/test/render-tree.test.ts`.

### 4. `@bind` on `type="range"` produced strings — **fixed**

The `Number()` conversion was tied only to `type="number"`; a range slider wrote `"5"`
into a `number` field (`a + b` ⇒ `"52"`). Blazor has `BindInputElement("range", …)`.
**Fix:** `range` like `number` (incl. `@bind:format`). Test: `compiler/test/codegen.test.ts`.

### 5. `@bind` on `type="date"` without a format showed nothing — **fixed**

The display bound the `Date` object raw (`String(date)` ⇒ invalid for a date input ⇒
empty field), the reverse direction parsed with `new Date(text)` (UTC midnight). Blazor uses
the default format `yyyy-MM-dd` for date inputs. **Fix:** default format `yyyy-MM-dd`
(formatValue/parseValue, local date); an explicit `@bind:format` replaces it.

### 6. Empty number input set 0 — **fixed**

The NaN guard let `Number("") === 0` through; a number input reports invalid text as
`""`, so clearing/a typo became `0`. Blazor (`TryParse("")` fails) and the
format path (`parseValue`) keep the old value. **Fix:** empty text keeps the value.

## K. Gaps (documented, not fixed)

### 7. `@bind:format` on text inputs (Blazor's date idiom) — **open**

`<input @bind="date" @bind:format="dd.MM.yyyy" />` is the standard example in Blazor. The
compiler decides conversion/format by the element (`type`), not by the field type, and
treats this as a string bind (TZS008 warning, format has no effect). A
runtime dispatch on the current model value (`Date`/`number` ⇒ formatValue/parseValue) would be feasible,
but that is more than a mini-fix. Lesson "Formatted bindings" shows `type="number"` +
`F2` and the date default and documents the deviation (Blazor track);
`language-reference.md` updated.

### 8. Select/number fields: no conversion by field type

As in 7: `@bind` on `<select>` always writes the string. Blazor converts to `int`/enum.
`tsazor check` reports the assignment to a `number` field (TS2322) — the lesson uses
string IDs and explains this.

### 9. The event argument type is not checked against the event name

`@onpointermove="move"` with `move(e: KeyboardEvent)` is green in the type check; Blazor would
reject `EventCallback<KeyboardEventArgs>` vs. `MouseEventArgs`. Proposal: in the typed
shadow, check the handler against `HTMLElementEventMap[name]`. Lesson "DOM events" says so
honestly ("the annotation is your promise").

### 10. The TS1360 squiggle sits behind the attribute value (in the LSP too)

The shadow checks component attributes as `(value) satisfies T`; TS reports TS1360 on the
*type* node, which has no source — `genToSrc` continues computing from the last token and
lands behind the value. The tutorial remaps the error to attribute start…value end
(`apps/tutorial/src/engine/type-check.ts`, `satisfiedValueSpan`). The LSP (`tsDiagnostics`)
has the same shift — candidate for the same fix there or a mapping entry for
the `satisfies` type in codegen.

### 11. happy-dom 18: `nextSibling` of `<select>`/`<form>` is `undefined`

`select.nextSibling`/`form.nextSibling` return `undefined` in happy-dom 18, although
`childNodes` is correct. The DomRenderer walks siblings via `nextSibling` ⇒ DOM updates
of elements *after* a select/form fail in `@tsazor/testing` ("Cannot read
properties of null"), but not in the browser (E2E checks the select bind in Edge). Affects
user tests with `@tsazor/testing`. Options: check a happy-dom update, or let `LogicalChildren`
walk via `childNodes` instead of `nextSibling` (only needed for tests — not done).

## L. Engine additions for the tutorial

- **In-browser `tsazor check`:** `src/engine/type-check.ts` builds the shadow modules like the
  LSP (`compile(…, { typedShadow })`, rewrite A for sibling components), plus a
  TS LanguageService over an in-memory FS (lib .d.ts + `@tsazor/runtime`/`components` d.ts,
  `virtual:tutorial-types`, lazy in the worker). Mapping via `TsazorGenMap` — for this a new
  subpath export `@tsazor/lsp/ts-mapping` (node-free). The worker answers in two stages
  (build ⇒ preview immediately, type diagnostics afterwards); type errors do not stop the preview. The
  lesson gate now also checks every `app-a`/`app-b` for type cleanliness (`typeErrors: true` for the
  lesson that is about them). Recurring wish from G.2: a `FileSystemHost` in
  `@tsazor/lsp`/`workspace`; then the duplication of shadow building and resolution would go away.
- **Highlighting:** the `.tsazor` stream mode treats control-block bodies and `@{ }` as
  code (statements, markup from a tag in statement position up to the closing tag, `@:` lines,
  `else`/`catch`/`finally` continuations); generics in `@code` are no longer tags.
- **Gate with interaction:** front matter `gate: click …; wait …` for lessons whose solution
  only differs in behavior; form state (value/checked) is part of the snapshot.
- **verify.mjs** uses a server on :5330 only if it serves this checkout
  (`/__tutorial-root`), otherwise it starts its own on the next free port
  (parallel worktrees).

# Implementing `@Bindable` + `this.observe` (design-bindable-observe.md)

## M. Framework gaps found during implementation

### 1. New `ComponentBase` members collide with component members — **fixed (S5, TZS031)**

Since 2026-10-04: `TZS031` reports a `@code` member or `@inject` name that would shadow a
`ComponentBase` member, with an explanation instead of TS2416. The list
(`compiler/src/reserved-members.ts`) is checked against the runtime by a test in `@tsazor/workspace`: a
new base member without a decision (reserved or lifecycle hook) makes the test fail.
No rename fix (renaming all usages is the job of the LSP rename).

The method was first called `track()` and broke the tutorial: `Lesson`/`TopBar`/`LessonMenu`/`LessonText`
had a parameter `track` (the learning track "ts"/"blazor") ⇒ TS2416 in the check; at runtime
the parameter would have overwritten the method. The parameter was renamed to `lessonTrack` (route placeholder
`/{lessonTrack}/{slug}`, URLs unchanged), and then the API itself to `observe()` (the
user's decision: `track` is a common domain word, the collision would have come back in ports). In general: Blazor's `ComponentBase` has PascalCase
members that never collide with camelCase fields — Tsazor's camelCase API shares its
namespace with user fields. Every new public/protected method on `ComponentBase`
(`observe`, `disposeSignal`, more in future) is a potential break for ports. The check reports
it (TS2416), but without explanation. Proposal: a list of reserved names + a dedicated diagnostic with
a rename fix, and new base members used sparingly (the decision "method instead of free function" in
the design table has this price).

### 2. `@bind-X` values were not type-checked — **fixed**

The shadow checked component attributes via `satisfies`, but not the value of a
component bind (`@bind-Value="x"`, `:get`). Now treated the same (pair like `@Bindable`);
all apps stayed clean.

### 3. Async handshake and `waitUntilIdle` — **decision**

An `observe` on a source whose `subscribe` returns a never-resolving promise made
`waitUntilIdle` (and thus `render()` in `@tsazor/testing`) hang as long as the handshake
was counted. Now it is not counted: a subscription is open-ended, it must not block idle detection
(or future prerendering, roadmap-ssr). Tests that want to wait for the handshake
wait for the source itself.

### 4. Synthesized members are not typed in `.ts` classes — **limit**

A decorator cannot extend the class type. In `.tsazor` the compiler declares
`declare valueChanged?: EventCallback<T>` itself; a code-behind/`.ts` class that
uses `this.valueChanged` has to write the line itself (the metadata/`@bind` do not need
it). With a non-literal initializer without an annotation, `T` is `unknown` (like TZS026 for
`@Parameter`).

### 5. Bundle

Bench bundle (`apps/bench/tsazor`): 87.38 kB / **24.79 KB gz** before ⇒ 88.70 kB / **25.28 KB gz**
after (+0.49 KB gz; `observe`/`disposeSignal`/`disposeInternal` are `ComponentBase` methods and
therefore not tree-shakeable; `@Bindable` itself drops out when unused; Vite removes the dev warnings
via `import.meta.env.DEV`). The 20.4 KB in the roadmap are an older state —
the baseline of this branch was already 24.79.

---

# Dogfooding: Tutorial M3 (Part 2, chapters 8–13) → Tsazor

17 new lessons (Reusing content, Cascading values, Services, Element references, Special
components, Organizing code), every claim pinned down in `apps/tutorial/test/claims-part2.test.ts`
against compiler, runtime and type check — executed as in the preview
(`test/harness.ts`: HeadOutlet as a second root, `Program.ts` with `createTsazorApp`).

## N. Framework gaps (fixed, with tests)

### 1. `@ref` on a component cut off its child content — **fixed**

`<ErrorBoundary @ref="b"><ChildContent>…</ChildContent>…</ErrorBoundary>` rendered **nothing**.
The compiler emitted `addComponentReferenceCapture` directly after the attributes, *before* the
fragment attributes (named slots, implicit ChildContent). But the ParameterView is the
run of attribute frames after the component frame (`attributeMap` stops at the first
non-attribute, like Blazor's `ParameterView`) — everything after the capture was dropped. Blazor
emits the capture last. **Fix:** `codegen.ts` emits the reference captures after
slots/ChildContent. Test: `compiler/test/templates.test.ts` ("@ref on a component with child
content"), lesson "Error boundaries" (boundary with `@ref` + `recover()`).

### 2. `EventCallback` only as a type in `@code` → TS2304 — **fixed**

`@Parameter() onPick?: EventCallback<string>` in a component *without* its own event handlers
was TS2304 in the type check: the compiler imported `EventCallback` (automatically available
according to the language reference) only when the markup needed it. **Fix:** scan of the member code as for
`@Parameter(`/`@Bindable(` (`codegen.ts`). Test: `compiler/test/codegen.test.ts`.

### 3. Non-generic `EventCallback.invokeAsync()` required an argument — **fixed**

`@Parameter() onToggle?: EventCallback` + `await this.onToggle?.invokeAsync()` was TS2554
(`TArg` = `unknown` ⇒ required parameter). Blazor's `EventCallback.InvokeAsync()` has none.
**Fix:** `invokeAsync(...args: unknown extends TArg ? [arg?: TArg] : [arg: TArg])` — typed
callbacks (`EventCallback<string>`) still require the argument. Pinned in `claims-part2`
("a plain EventCallback needs no argument; a typed one does"); all packages build unchanged.

### 4. TS2869 on mixed attribute values — **fixed**

`style="width: @(score * 25)%"` was *Right operand of ?? is unreachable* in the type check (TS 5.6+
reports `??` after syntactically never-nullish expressions). The codegen produces
`` `width: ${(x) ?? ""}%` `` — the `?? ""` is pure runtime semantics (null ⇒ empty). **Fix:** the
typed shadow omits it (mapping offsets unchanged), the real build keeps it.
Affects LSP and `tsazor check` alike. Test: `compiler/test/typed-shadow.test.ts`.

## O. Engine additions (tutorial)

- **`Program.ts` as entry point:** if a lesson has `Program.ts`, the preview starts the app
  through it (`createTsazorApp({ root, services })`, like a real app) instead of mounting `App` directly
  — this makes services/`@inject` teachable. Gate/claims replace `@tsazor/runtime` in
  `Program.ts` with a shim that records the options, and mount like
  `createTsazorApp` (NavigationManager, one renderer, HeadOutlet root in `document.head`).
- **Title in the preview:** the iframe reports `document.title` (MutationObserver on `<head>`),
  the preview bar shows it as a tab. The gate snapshot includes the head (title + content).
- **Type check:** `.tsazor` imports from `.ts` files (`import App from "./App.tsazor"` in
  `Program.ts`) resolve to the shadow (`resolveModuleNameLiterals`); the LSP's `TItem` inference
  (inference requests ⇒ program query ⇒ shadow rebuild) is replicated — without it
  a template's context was `any` and `@todo.titel` went undetected. This is the third copy of
  LSP logic in the tutorial (G.2: a `FileSystemHost` in `@tsazor/lsp` would make them unnecessary).
- **`_Imports.tsazor` is diagnosed** (invalid `@import` forms TZS016, missing
  `@using` folders TZS018, TZS014 for `@authorize`) — previously the build skipped the file,
  errors in it stayed invisible.
- **Gate:** `refactor: true` (the solution must render *identically* — for code-behind/_Imports/
  container lessons); errors handled by an `ErrorBoundary` do not count as errors;
  `.gate/lessons` instead of `.gate` (otherwise the `afterAll` deleted claims dirs running in parallel).
- **No file creation in the editor:** lessons whose solution needs a file
  (`X.tsazor.ts`, `_Imports.tsazor`) ship it empty in the start state. Desirable for M4:
  creating/deleting files in the tabs.

## P. Friction and deviations (documented, not fixed)

### 5. `RenderFragment<T>` as a generic reference — **open**

The metadata recognizes `RenderFragment<T>` (metadata.ts: "a function type … or a generic
`RenderFragment<T>` reference"), but the runtime type is not generic ⇒ TS2315 *Type
'RenderFragment' is not generic.* The tutorial teaches the TS notation
`(item: TItem) => RenderFragment` (which all runtime components use anyway). Proposal:
`export type RenderFragment<T = void> = [T] extends [void] ? (b: RenderTreeBuilder) => void :
(context: T) => (b: RenderTreeBuilder) => void` — a small but central type change; not
done on the side.

### 6. `RenderFragment` needs an import, `EventCallback`/`Parameter` do not

Inconsistent for learners: the compiler auto-imports `Parameter`, `CascadingParameter`,
`Bindable`, `inject`, (now also) `EventCallback`, but not `RenderFragment`. The
apps solve it via `_Imports.tsazor`; the tutorial shows `@import type { RenderFragment }` and
later `_Imports`. Proposal: add `RenderFragment` to the auto-import list (a pure type, costs nothing).

### 7. Types for `@ref`, `DynamicComponent`, `ErrorBoundary` need `@import` (H.6 confirmed)

`<Editor @ref="editor" />` + `editor?: Editor` ⇒ TS2304 without `@import Editor from
"./Editor.tsazor"`; `{ heading: Heading }` for `DynamicComponent` ⇒ a runtime
`ReferenceError` without the import; `boundary?: ErrorBoundary` ⇒ TS2304. Natural for TS developers,
a stumbling block for Blazor developers (the lessons explain it). The proposal from H.6 (the shadow
types an `@ref` field without an annotation) remains open.

### 8. Unnamed `@CascadingParameter()` without `type` takes any unnamed cascade

Blazor matches unnamed ones by declared type; Tsazor without the `type` option takes the nearest
unnamed cascade — a `string` and a `number` cascade collide where Blazor separates them
(pinned). Lesson "Names and types" teaches names or `{ type }`. Conceivable: the compiler derives
`type` from the annotation when it is an imported class.

### 9. Errors without an `ErrorBoundary` do not end the app; errors in `ErrorContent` loop

Without a boundary the renderer logs and the app keeps running (Blazor: circuit/app dead,
`#blazor-error-ui`) — explained as a deviation in the Blazor track. If the `ErrorContent` itself throws,
the same boundary handles the error again until `maximumErrorCount` (100) is reached —
100 console lines, then fatal. Mechanically like Blazor, but loud; the tutorial only says "keep
the error view simple".

### 10. `createTsazorApp().dispose()` does not dispose the service provider — **open**

Noticed while writing the lifetimes lesson: `dispose()` tears down components, the head root,
NavigationManager and the HMR bridge, but does not call `services.dispose()` — singletons with
`dispose()` are never released (Blazor disposes the root provider on shutdown).
Small, but a behavior change for apps with their own disposables; the tutorial makes no claim
about it. Proposal: the app's own provider is released in `dispose()` as well.

### 11. Code-behind: markup members must be `protected`

Because the generated markup class *inherits*, a `private` member of the code-behind class is
TS2341 in markup. Logical, but new for Blazor developers (a partial class shares `private`) — now in
`docs/code-behind.md` and in the lesson "Code-behind".

# Business SPA port: Svelte 4 → Tsazor

Port of a proprietary business SPA (~4k lines, Svelte 4 + TS, ~38 components, hash router,
Svelte stores, custom i18n, order form with validation) that is embedded as an iframe in a portal
(token via query string or `postMessage`). The app's code lives outside
this repo; only generic findings are recorded here. Verification: original and port against the same
mock backend, Playwright (Edge) over 11 flows / 21 steps with screenshot comparison —
19 steps pixel-identical, requests and order bodies identical (rest: see U).

## Q. Framework gaps (fixed, with tests)

### 1. No hash routing — **added (Tsazor extension)**

The app is run on hosting without an `index.html` fallback and must keep its URLs
(`…?token=…#/route/1`). New: `createTsazorApp({ routing: { mode: "hash" } })` or
`new NavigationManager({ mode: "hash" })`. The NavigationManager works with a *logical*
URI (fragment route under `baseUri`); router, `@page`/constraints, NavLink matching and
SupplyParameterFromQuery stay unchanged, `location.search` is never written. NavLink
renders `#/…` hrefs (`toLinkHref`), `<a href="#/…">` is intercepted, popstate and a bare
`hashchange` navigate exactly once, `forceLoad` reloads explicitly.
Tests: `packages/conformance/test/runtime/hash-routing.test.ts`; docs: language-reference
"Hash routing", getting-started "Hosting".

### 2. `tsazor check` without a path checked nothing — **fixed**

`[project-root]` is optional according to the usage, but without an argument it exited 0 without checking. As a result
the apps' `"build": "tsazor check && vite build"` gates (blazing-pizza, demo, gallery,
sleipnir-ticker) had no effect. The root now defaults to `.`; `--help` → usage/exit 0.
Test: `packages/cli/test/check-cli.test.ts`.

### 3. `tsazor check` ignored code-behind and imported `.ts` — **fixed**

Only the shadows were diagnosed; a type error in `X.tsazor.ts` (here: a
Blazor-typical `override onInitializedAsync`, see R.5) passed the gate. A third pass
now reports the real `.ts` sources of the shadow graph under the root. In the same program,
a relative `.tsazor` import from a `.ts` file resolves to the shadow
(`import type Child from "./Child.tsazor"` types an `@ref` field in code-behind — previously
TS2749, because only the ambient `ComponentType` declaration was visible), and the tsconfig's `.d.ts` files
are program roots (otherwise TS2307 for virtual modules). The broader gate found
a real error in `apps/blazing-pizza/src/models.ts` (re-exported types without an import).
Test: `packages/lsp/test/check-sources.test.ts`.

### 4. `EditForm` with an `EditContext` parameter rebuilt on every re-render — **fixed**

`onParametersSet` compared the (missing) `Model` with the context's model and created
`new EditContext(undefined)` on every parent render → region rebuild, inputs and
`ValidationMessage`s were attached to an empty context (messages appeared one interaction too
late and stale). Blazor compares `Model` only when one is passed.

### 5. `InputBase`: `NotifyFieldChanged` before `ValueChanged` — **fixed**

Validators that read the model (cross-field rules) saw the old value. Blazor's
order: first `ValueChanged` (the synchronous part of the `@bind` setter writes the field), then
`NotifyFieldChanged`. Tests for 4 and 5: `packages/conformance/test/runtime/forms.test.ts`.

## R. Friction and gaps (documented, not fixed)

### 1. No localization (E8)

The app brings i18n as a store; in the port it is a DI service with `observe()`. Requirements from
real-world use:
- Locale as app-wide, observable state. Today **every** translating component has to call
  `this.observe(loc)` (Svelte: `$t` subscribes automatically) — a framework API should
  re-render consumers without boilerplate (e.g. `@inject IStringLocalizer L` with automatic
  subscription management, or a tree re-render on culture change).
- Sources with precedence: explicit (URL parameter, host `postMessage`) > user profile
  (token response) > default; "explicitly set locks later profile values".
- Load tables asynchronously from a URL, bundled fallback; a defined policy for missing
  keys/locales (the app throws — more sensible: fallback culture + dev warning).
- Placeholders (`{{name}}`), typed keys (from the JSON table, checked by `tsazor check`).
- Localized **validation messages**, see R.2.
- Snapshot trap: texts copied into data models (navigation entries) do not switch
  language — the API should make keys storable instead of strings.
- Not used, but obvious: numbers/dates per culture (currently invariant, A5/B7).

### 2. Validation decorators are not localizable

`@Required()` & co. carry fixed .NET texts; there is no `ErrorMessage`/resource key/
message factory. The port declares the rules via decorators (`@MinLength(1)`,
`@RegularExpression(…)`) and maps `rule.kind` to translation keys via the `validators` adapter
(`validationRulesOf`). Proposal: an option
`{ message: string | ((context) => string) }` or a `ValidationMessageProvider` service.

### 3. The template's form UX does not map 1:1 onto EditForm

The template shows field messages only after the first submit and then updates them on every
keystroke; Blazor validates on `onchange` and shows immediately. Replica: `ValidationMessage`
behind a flag + a small `InputBase` subclass with `oninput` (InputText has — as in
Blazor — no event option; a `@bind-Value:event` equivalent would be useful).
`ValidationMessage` renders `<span>` instead of the original `<div>` → `::deep .validation-message`.

### 4. `<select @bind>` with a non-matching value

Blazor/Tsazor then leave the first option selected (browser default), Svelte shows an empty
select. Tsazor sticks with Blazor; the port sets `selectedIndex = -1` via `@ref`. For the
migration guide (E7b).

### 5. No `onInitializedAsync`

Tsazor only has `onInitialized(): void | Promise<void>`. A Blazor developer writes
`onInitializedAsync` — with `override`, TS4117 reports the error (since Q.3 also in the gate); **without**
`override` the method is silently never called (the page hung in the loading state). Proposal:
a warning with a quick fix when a component declares `onInitializedAsync`/`onParametersSetAsync`/
`onAfterRenderAsync` (or PascalCase forms); or recommend `noImplicitOverride`.

### 6. Double quotes in handler attributes

`@onkeydown="(e) => { if (e.key === "Enter") … }"` produces a cascade of TZS009/TZS024/TS1109
(Razor also ends the attribute value at the inner `"`). The message could point specifically to
single quotes or `@(...)`.

### 7. `undefined` in mixed attributes and defaults

Svelte: an explicitly passed `undefined` overrides the prop default, and
`style="--x:{undefined}"` renders `undefined`; Tsazor renders `""` in mixed attributes.
Both result in an invalid custom property — pixel-identical. For the guide: do not build in an
"undefined → default" mapping (that had initially broken parity).

### 8. Narrowing in deferred content (H.3 confirmed)

Needed in almost every component with slots: `@if (x) { const current = x; <Slot>@current…</Slot> }`
or a getter — also for `<HeadContent>` and the `ChildContent` of simple wrappers (Tile, Button).
Fixed since 2026-10-10 (F15, see H.3): the narrowing reaches slots and child content.

### 9. Svelte idioms without a direct equivalent

- CSS custom property props (`<Comp --pad="10px">`, Svelte wraps in `display: contents`) →
  a parameter that sets the property.
- `:global(...)` in component CSS → a global file (scoped CSS only knows `::deep`, like Blazor).
- `svelte:self` → the component's own tag works; an `@import` of its own file gives TS2440 instead of
  a hint "a self-reference needs no import".
- `$querystring` reactivity → `@SupplyParameterFromQuery()` + `onParametersSet` (clean).

### 10. npm + `file:` tarballs

npm caches `file:` tarballs by the integrity in the lockfile; a newly packed tarball with the same
name is **not** installed. For consumers before a registry release:
versioned tarball names or remove the integrity.

## S. What worked smoothly

Scoped CSS 1:1 (Svelte scoping → `X.tsazor.css`, pixel-identical), named slots as RenderFragments,
`@Bindable` across two levels (scroll value child → grandchild → page), `observe()` for services,
`@ref` on components with a method call, `HeadContent`, `MarkupString`, DI with
factory registrations, code-behind for the larger components, back/forward in hash mode.

## T. Effort (for E7/E7b)

- **Mechanical** (estimated ~60 %): markup (`{#if}`→`@if`, `{#each}`→`@foreach`,
  `on:click`→`@onclick`, `{x}`→`@x`), props → `@Parameter()`, `<style>` → `.tsazor.css`,
  stores → service classes with `notify()`, `$store` → service member + `observe`.
- **Manual** (~40 %): `$:` blocks (understand dependencies → getter or `onParametersSet`),
  `onMount` mutations, `bind:` chains, slot contents with narrowing, form validation,
  timing quirks of the template (measuring at `bind:this`, order of child/parent `onMount`).
- A Svelte→Tsazor markup codemod would cover the mechanical part.

## U. Remaining differences

- Detail page: in the port the scrollable area gets the 10px right padding (overflow measured after the
  first render); the template measures at `bind:this`, before the content is there, and
  never gets it (~1.4 % pixels). Deliberately not replicated.
- Bundle: ~58 kB gzip (port) vs. ~43 kB gzip (Svelte original).

# Dogfooding: FluentCMS admin (the owner's `apps/fluentcms-admin`, not committed) → Tsazor

A second, hand-written port of FluentCMS's admin UI against the same backend, written by a Blazor developer
without `@tsazor/dotnet`: login with a JWT, the admin shell, content types. Its type errors (2026-10-11) were app
code; what they say about the framework:

## V. Framework gaps

### 1. `attachJwtAuth` dropped every other header — **fixed**

`new Request(request, { headers: { authorization } })` replaces a request's headers instead of adding one: a POST
lost `content-type: application/json` (ASP.NET Core's `[FromBody]` answers 415) and the client's `defaultHeaders`.
The test checked the `authorization` header of a GET only. The admin had its own interceptor
(`request.clone()` + `headers.set`) and never hit it. Fixed with a copy of the headers; a test sends a POST.

### 2. Nothing led to `@tsazor/dotnet` — **fixed (docs)**

The admin rebuilt by hand what `@tsazor/dotnet` has: the bearer token per request (`attachJwtAuth`), the
envelope (`tsazor-dotnet generate --envelope data,errors`), errors as values (`HttpResult`). A Blazor developer
starts from `TsazorHttp` (`HttpClient`) and the auth lesson; neither pointed there. Now in migration-practices.md
(the backend boundary), and the tutorial's Blazor track names it: "Signing in" the providers and `attachJwtAuth`,
"A typed client" the `--envelope` option.

### 3. No reaction to a 401 — **added (owner's decision, Tsazor extension)**

`Program.ts` reached for `http.onUnauthorized`. Neither `TsazorHttp` nor `attachJwtAuth` reacted to a 401, as
Blazor's handlers don't (a `DelegatingHandler` of the app's own). Now `attachJwtAuth` logs out when a request that
carried the current token comes back 401, so `AuthorizeRouteView` shows its `NotAuthorized` (the redirect to the
login). To tell the token a response answers, a response interceptor gets the request that was sent as its second
argument. A 401 to an older token (a new login came in between) or to a request with its own `authorization`
changes nothing; a 403 never logs out.

Then the admin moved to `JwtAuthenticationStateProvider` + `attachJwtAuth` (its `FluentAuthProvider` a subclass that
adds `signIn` and the profile's role; a test of its own against a stubbed FluentCMS API). That move found 4–6
(5 and 6 decided by the owner the next day):

### 4. A real .NET token decoded as signed out — **fixed**

FluentCMS's `UserTokenProvider` names the user only by `ClaimTypes.NameIdentifier`, which `JwtSecurityTokenHandler`
writes as `nameid` (besides `sid` and `email`; no `name`, no `sub`, no `role`). `principalFromJwt` knew the long
URI of that claim, not the short form: a real login (probed against the port's backend) decoded as anonymous —
after the move the user would have been signed out right after signing in. The tests had hand-made tokens with
`name` or `sub`. `nameid` is now the fallback before the long URI; a test uses the claims of the real login.

Beside it, fixed the next day: a principal counted as signed in only with a name. In .NET an identity with an
authentication type is authenticated even when `Name` is null, so a token without any name claim (only `oid`, say)
now signs in too, with an empty name.

### 5. Response interceptors weren't an onion — **changed (owner: .NET's order)**

The admin's envelope interceptor throws on every non-2xx. Added before `attachJwtAuth`, the 401 never reached it
and the logout silently didn't happen (the admin's test failed that way). `TsazorHttp` ran response interceptors
in the order added, like the request ones; .NET's handler chain is an onion — the handler added last sees the
response first — so "build the client, then attach auth" works there. Now `TsazorHttp` unwinds the same way
(breaking): an interceptor added after one that throws on an error status still sees the response.

### 6. Roles that only a profile knows — **added (owner: a promise, as Blazor's Task)**

FluentCMS's token carries no roles; `/api/Account/GetCurrent` says `isSuperAdmin`. The admin's subclass overrides
`getAuthenticationStateAsync` to add the profile's role and notifies a second time once it arrives. In between,
the user is signed in without the role: a page that needs it can show `NotAuthorized` for a moment, and the admin's
`NotAuthorized` redirects to the login. Blazor's `NotifyAuthenticationStateChanged` takes a
`Task<AuthenticationState>`, and `AuthorizeView` shows `Authorizing` until it completes — no in-between state.
Tsazor's took a resolved state. Now it takes a promise too: until it resolves, `AuthorizeView` and
`AuthorizeRouteView` show `Authorizing`, subscribers hear the resolved state only, a newer notification wins, and a
rejected promise counts as signed out. `JwtAuthenticationStateProvider` gained `createUserAsync` (Blazor
WebAssembly's `AccountClaimsPrincipalFactory.CreateUserAsync`), which the admin overrides for its role: a login
notifies once, with the role. The provider works the state out on first request now, not in its constructor —
an override that reads its own fields would have run before they were set. And `getAuthenticationStateAsync`
answers for the token current when it finishes: the admin's override swallows profile errors, so on a reload with
a rejected token it answered "signed in" for the token `attachJwtAuth` had just logged out (the admin's test found
it; the auth components had dropped that answer already). (Overriding `setToken` worked well:
login, logout and `attachJwtAuth`'s 401 logout all pass there, so the admin keeps its stored token in step in one
place.)

## W. Friction (app code, no fix needed)

- **`getJson<T>` is a cast, not a check.** Ten of the twelve errors were inline response types
  (`{ isSuccess; data?; errors?: unknown }`) that had drifted from the shared envelope type
  (`errors?: AppError[]`). Declare the envelope once, or generate the client.
- **Workarounds outlive their gap.** The admin's interceptor said `TsazorHttp` throws a bare `Error` without the
  body; `TsazorHttpError` has carried `status` and `body` since 5.2.
- **A token in memory doesn't survive a reload.** The admin keeps its token in `sessionStorage` (the owner's
  choice, written down in its `token-store.ts`), as Blazor WebAssembly's MSAL does by default; auth.md says memory
  only. A Blazor developer expects the session to survive F5 — auth.md now names the price, and the BFF as the way
  to keep the session without a script holding the token.
