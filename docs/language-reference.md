# Language reference (.tsazor)

## Directives

| Directive | Example | Semantics |
|---|---|---|
| `@page` | `@page "/user/{Id:int}"` | Route template, see [Routes](#routes). Multiple `@page` ⇒ each template is a route (Blazor) |
| `@layout` | `@layout MainLayout` | Layout for this route (overrides `_Imports`) |
| `@using` | `@using ./Shared` | Component tags and `@inject`/`@inherits` types (see Getting Started) |
| `@import` | `@import { Status, formatDate } from "./utils"` | TypeScript import for markup and `@code` (see below); inherited from `_Imports.tsazor` |
| `@inject` | `@inject NavigationManager Nav` | DI: field initializer `inject(<Type>)` |
| `@inherits` | `@inherits LayoutComponentBase` | Base class (default: `ComponentBase`) |
| `@typeparam` | `@typeparam TItem` / `@typeparam T extends X` | Generic type parameters (declarative in v1); a C# constraint `where T : …` ⇒ error TZS021 pointing to `extends` |
| `@authorize` | `@authorize` / `@authorize({ roles: ["Admin"], policy: "P" })` | The route requires sign-in (and roles/policy) — see [@authorize and @attribute](#authorize-and-attribute) |
| `@attribute` | `@attribute @tracked()` | TS class decorator; C# attributes (`[Authorize]`) ⇒ error TZS021 with the TS form |
| `@code` / `@functions` | `@code { … }` | TypeScript class members, verbatim |
| `@namespace`, `@implements`, `@rendermode`, `@preservewhitespace` | `@namespace App.Pages` | Blazor-only: accepted and ignored (`@rendermode`/`@preservewhitespace` with warning TZS014) |
| `@@` | `@@` | A literal `@` |
| `@* … *@` / `@** … *@` | `@** A card with a header. *@` | Razor comment. `@** … *@` at the very start of a component file is its doc comment (Tsazor extension, the markup counterpart of `/** */`): it goes into the component manifest (`doc`) and the reference; a plain `@* … *@` stays a note |

Directives are only valid at document level; inside elements or code blocks ⇒ TZS013.
An unknown `@word` is not a directive but an implicit expression (Razor).

### Directive attributes

| Attribute | Example | Semantics |
|---|---|---|
| `@on<event>` (+ `:preventDefault`, `:stopPropagation`) | `@onclick="save"` | Event handler, see [Expressions](#expressions) |
| `@bind`, `@bind-<Param>` (+ modifiers) | `@bind="name"` | Two-way binding, see [@bind](#bind-blazor-net-7-semantics) |
| `@key` | `@key="item.id"` | Diff key of an element or component |
| `@ref` | `@ref="input"` | Captures the element (or component instance) into a member |
| `@attributes` | `@attributes="extra"` | Attribute splat |
| `@attach`, `@attach:<name>` | `@attach="autofocus"` | Tsazor extension: runs a function with the element once it is in the DOM, with cleanup — see [@attach](#attach-tsazor-extension) |

The `@` attribute namespace is reserved for directive attributes, as Microsoft treats it (Razor
itself renders an unknown one as a literal attribute named `@x`); an unknown one ⇒ TZS001.

## Routes

Templates work as in Blazor: literals (case-insensitive), `{name}`, `{name:constraint}` (several: `{id:int:regex(...)}`),
optional `{name?}`/`{id:int?}` (only at the end, possibly before a catch-all), catch-all `{*path}`/`{**path}` (last segment).
Query string and hash do not take part in matching. Invalid templates and unknown constraints are errors (Blazor's messages).

| Constraint | Value in the page parameter | Notes |
|---|---|---|
| `int` | `number` | 32-bit range, sign allowed |
| `long` | `bigint` | 64-bit range; `bigint` so that values > 2^53 stay exact |
| `bool` | `boolean` | case-insensitive (`True` ⇒ `true`) |
| `double`, `float` | `number` | Decimal point, exponent, thousands comma (`float` via `Math.fround`) |
| `decimal` | `number` | No exponent; JS has no decimal type (double precision) |
| `datetime` | `Date` | ISO `yyyy-MM-dd`, optionally `THH:mm[:ss[.f]]` and `Z`/`±hh:mm`; without an offset, local time |
| `guid` | `string` | Formats D, N, B, P; value = URL text |
| `alpha`, `alphaNumeric` | `string` | |
| `nonfile` | `string` | The path does not end in a file name (`app.css`, `favicon.ico`). On a catch-all it checks the whole remainder, not each segment: `@page "/{**route:nonfile}"` |
| `regex(...)` | `string` | Anchored as `^(?:…)$`, case-insensitive; `{{`/`}}` for curly braces |

Every constraint is anchored and grouped (`regex(a|b)` matches only `a` or `b`). Segments are URL-decoded,
except `%2F` (.NET 8); a catch-all receives the decoded remainder joined with `/`, empty ⇒ `null`. A missing
optional parameter is `null`, as are parameters that only occur in *another* `@page` template of the same page.
Multiple constraints must all match; the first typed one determines the value.

**Precedence** (Blazor's route table): segments are compared from the left — literal before constrained parameter before
parameter before constrained catch-all before catch-all; on a tie, the route with fewer segments wins. The order in the
manifest does not matter (`/users/new` beats `/users/{id}`). Two routes with equal precedence, equal literals and
equal constraints (`/a/{x}` and `/A/{y}`) ⇒ error "The following routes are ambiguous" when the route table is built
(router lifecycle). Equal precedence but different constraints (`{x:int}` vs. `{x:bool}`) ⇒ manifest order.

### Scrolling and fragments

As in Blazor, after an internal navigation the `Router` scrolls to the top — or, when the target has a
fragment, to the element with that id (else the first with that `name`): `<a href="orders#total">`. With
a `<base href>`, write the page path in front of the fragment; a bare `href="#total"` resolves
against the base. A link that only changes the fragment of the current page adds a history entry
and scrolls, without `LocationChanging`/`LocationChanged`. Back/forward leaves the position to the
browser. A deep link with a fragment scrolls once the Router rendered.

### OnNavigateAsync and Navigating

Blazor's `Router` hooks, unchanged: `OnNavigateAsync` runs before each navigation renders (the
first one too) and receives `{ path, signal }` — `signal` is aborted when a newer navigation starts
(Blazor's `CancellationToken`). Meanwhile the router renders `<Navigating>`; without it, the previous
page stays until the hook finishes. A failing hook is a failure of the router (an `ErrorBoundary`
around it shows it).

```tsazor
<Router OnNavigateAsync="prefetch">
    <Found Context="routeData"><RouteView RouteData="@routeData" /></Found>
    <Navigating><p role="status">Loading…</p></Navigating>
</Router>
```

### Holding the previous page (Tsazor extension)

An in-app navigation keeps the previous page on screen until the new one has rendered and its async
work is done. That covers its `OnInitializedAsync`/`OnParametersSetAsync`, the Router's
`OnNavigateAsync`, and a lazy page's chunk. The new page then shows in one step, as with Blazor's
enhanced navigation. Without the hold, a page whose data is still loading would show its empty state
for a few frames, as in Blazor's interactive render modes. Tsazor holds the page because in Blazor that
empty state is something static SSR never showed.

With `<Navigating>`, the router shows that instead while `OnNavigateAsync` runs: the app shows its own
waiting state. The URL and `LocationChanged` change together, a frame after the click (the browser first captures
the previous page). A navigation during the hold joins it,
and a click on a link of the held page follows the link. The hold lasts at most 1000 ms; then the page
shows as far as it got. Data a service loads by itself on `LocationChanged` isn't waited for: load it in
`OnNavigateAsync`. The hold uses the browser's view transitions, without animation. Design:
[design-navigation-hold.md](design-navigation-hold.md).

```ts
createTsazorApp({ root: App, routes, routing: { holdPreviousPage: 500 } });   // ms; false: off
```

### Lazy routes (Tsazor extension)

Pages can load on the first navigation to them — Blazor lazy-loads assemblies in `OnNavigateAsync`;
Tsazor uses Vite's code splitting. Opt in per glob in the Vite plugin (design:
[design-lazy-routes.md](design-lazy-routes.md)):

```ts
tsazor({ lazyRoutes: ["src/Pages/Admin/**"] })   // a feature folder; `true` = every page
```

The manifest then carries `{ template, load, authorize }` for those pages (`LazyRouteEntry`): the
templates and the `@authorize` requirements are known up front, the page (and its `@layout`) loads
once, as its own chunk, while the router shows `<Navigating>`. Grouping a feature into one chunk is
Vite's `build.rollupOptions.output.manualChunks`. A chunk that fails to load (typically after a
deploy) reloads the target URL once; a second failure is an error. Loading a page's code is no
access control — the server enforces that ([auth.md](auth.md)).

### Hash routing (Tsazor extension)

Blazor routes by the URL path (history routing), which needs a server that answers every deep link
with `index.html`. Where that fallback cannot be configured — static file hosting, an app embedded in
an iframe of a host you do not control — opt into hash routing at app level:

```ts
createTsazorApp({ root: App, routes, routing: { mode: "hash" } });
// or, with a shared manager: new NavigationManager({ mode: "hash" })
```

The default stays `"history"` (Blazor). In hash mode the route path **and its query** live in the
fragment: `https://host/app/index.html?token=abc#/orders/5?tab=2` is the route `orders/5` with the
query `tab=2`. The real path and `location.search` (`?token=abc`) are never written — they survive
every navigation.

`NavigationManager` works with a *logical* URI — the fragment route below `baseUri` — so everything
built on it behaves exactly as in history mode:

| API | Hash mode |
|---|---|
| `baseUri` | Directory of the document (`https://host/app/`); `<base href>` only affects assets |
| `uri` | Logical: `https://host/app/orders/5?tab=2` (the address bar shows `…/index.html?token=abc#/orders/5?tab=2`); a fragment without `#/` (or none) is the root route |
| `toBaseRelativePath`, `baseRelativePath` | `orders/5?tab=2` — Router matching, `@page` templates and constraints unchanged |
| `toAbsoluteUri` | Also reads `#/orders` and root-relative `/orders` as routes (the pathname has no route meaning) and a real URL of the document with a `#/` fragment |
| `navigateTo(uri, …)` | Pushes/replaces `path + search + #/route`; `forceLoad` inside the base writes the entry and reloads the document (a fragment change alone never reloads); external URLs as usual |
| `toLinkHref(href)` | The href to render: `orders/5` ⇒ `#/orders/5`; fragments and external URLs unchanged (history mode: always unchanged) |
| LocationChanged / locks | Same flow; back/forward (popstate) and a bare `hashchange` (typed URL, `location.hash = …`) navigate, announced once |

- **NavLink** renders `#/…` hrefs (they work without interception: new tab, copied link) and matches
  the logical URI as in Blazor.
- **Plain anchors:** `<a href="#/orders">` clicks are intercepted (location-changing handlers see
  `isNavigationIntercepted`); other hrefs (`orders`, `/orders`, `#section`) are real document
  navigations — write route links as `#/…` or use `NavLink`. In-page anchors (`#section`) do not mix
  with hash routing (the route becomes the root, as in other hash routers).
- **SupplyParameterFromQuery** reads the fragment's query, not `location.search`; read real query
  values (a token in `?…`) from `window.location.search`.
- `FocusOnNavigate`, `NotFound`, `NavigationLock` and `@authorize` are unaffected (they work on route data).

## @authorize and @attribute

C# attributes have no TypeScript counterpart; the TS forms are `@authorize` (route metadata)
and `@attribute @decorator(…)` (a real class decorator):

| Syntax | Result |
|---|---|
| `@authorize` | The route requires sign-in |
| `@authorize({ roles: ["A", "B"], policy: "P" })` | The route's `AuthorizationRequirements` (`{ roles: [...] }` / `{ policy: "P" }`), checked by `AuthorizeRouteView` (roles: at least one; policy: registered in `AuthorizationService.policies`) |
| `@attribute @tracked("x")` (TS form: value starts with `@`) | A real class decorator, emitted verbatim above `export default class` (standard TC39 decorator, like `@Parameter`: `(value, context: ClassDecoratorContext)`); names come in via `@import` |
| `@attribute [Authorize]`, `[Authorize(Roles = "A, B", Policy = "P")]`, `[Authorize("P")]` | Error TZS021 with the TS form (`@authorize`, `@authorize({ roles: ["A", "B"], policy: "P" })`) |
| `@attribute [AllowAnonymous]` | Error TZS021: remove it — a page is anonymous as long as it declares no `@authorize` |
| `@attribute @CascadingTypeParameter("TItem")` | The type parameter cascades to the components inside (see [templated components](#templated-components-named-slots-and-template-contexts-23)); `[CascadingTypeParameter(nameof(TItem))]` ⇒ TZS021 with this form as its fix |
| Any other C# attribute (`[StreamRendering]`; `[Route(…)]` ⇒ `@page`) | Error TZS021: remove it or write it as a TS decorator |

- The argument of `@authorize` is a TS object literal (read with the TS parser, may span
  multiple lines) containing only `roles` (an array of string literals) and `policy`
  (a string literal) — the requirement is static route metadata. Other values, keys or
  shapes ⇒ TZS019.
- Multiple `@authorize` must all be satisfied (like multiple `[Authorize]` in Blazor). Two with
  `roles` (or two with `policy`) cannot be represented in `AuthorizationRequirements` (one role list,
  one policy) ⇒ error TZS019 instead of a silent weakening.
- **No inheritance:** `@authorize` applies per page; in `_Imports.tsazor` it has no effect
  (warning TZS014). That is also why no opt-out (Blazor's `[AllowAnonymous]`) is needed.
- As in Blazor, the requirement only applies to routes (`@page` + `AuthorizeRouteView`), not
  to embedded components. Unreadable `@attribute` values (`@attribute Authorize`) ⇒ TZS019.
- Like Blazor's `RenderFragment<AuthenticationState>`, `<NotAuthorized>` receives the
  `AuthenticationState` as its slot context (`@context.user.name`, 3.5).

## buildRenderTree is generated

Every `.tsazor` file generates `buildRenderTree` — even one without markup, just as Razor generates
`BuildRenderTree` for every `.razor`. A hand-written `buildRenderTree` in `@code` or
in the code-behind class is therefore an error (TZS020, Blazor: CS0111 duplicate member)
instead of being silently replaced. Hand-written render code belongs in a plain
`.ts` class (`extends ComponentBase`) that is imported as a component.

**Static markup blocks (F1a).** As Razor does, an element whose whole subtree is static becomes
one `addMarkupContent` frame; the runtime parses each block once and clones it per insertion,
without boundary comments. The DOM is the same as with element frames. A subtree stays element
frames when it contains an `@` expression or directive attribute, a component, a form control
(`input`, `textarea`, `select`, `option`), a `value`/`checked`/`selected` or `style` attribute (a
strict CSP blocks styles in parsed markup), or a shape the HTML parser would rebuild (`<p>` around
a `<div>`, `<table>` without `<tbody>`, `<pre>`, `<template>`, unknown camelCase SVG names). The
Vite plugin's `staticMarkup: false` turns blocks off (an escape hatch for one release). Details:
[design-static-markup.md](design-static-markup.md).

**Stable event handlers (render hints, H1).** `@onclick="e => select(e, row)"` is a new closure on
every render, in Blazor a new delegate — so every re-render would swap every handler. Tsazor
chooses to compile an event-handler lambda (on an element event or a component `EventCallback`
parameter) into a method of the component that creates the handler from the render-time values it
captures (`row`), and binds those values: re-rendering with the same values keeps the handler, and
the diff swaps nothing. A changed value swaps it, as before; `this.x` is read when the handler runs,
as before. This applies only when every captured local stays constant — a `const` (local or
`@foreach (const … of …)` variable) or a template `context` no code assigns; a `let`/`var`, a
counting `@for` variable or anything else keeps the closure per render. Method groups
(`@onclick="save"`) are bound as before. Nothing else is visible: a child component that gets such a
handler as a parameter re-renders with its parent exactly as in Blazor — parameter change detection
treats a handler that captures locals as changed, like C#'s `Delegate.Equals` does for a closure (a
new target every render); only the DOM diff uses the stable form. The Vite plugin's
`renderHints: false` emits a closure per render. Details: [design-render-hints.md](design-render-hints.md).

**Skipping unchanged keyed rows (render hints, H2).** A re-render builds every row of a list again
and the diff walks each one, frame by frame — in Blazor, too. Tsazor chooses to skip a row that
would come out the same: for a `@foreach` whose body is one element with `@key`, the compiler
evaluates the row's dynamic values first — attribute values, `@` content, the key and the stable
handlers of H1, in source order and each exactly once — and the runtime compares them with the
previous render's values for the same key (`Object.is`, handlers by `EventCallback` equality). When
all are the same, the previous render's frames of that row are reused and the diff skips it; a
changed value builds and diffs the row as before. The DOM and every lifecycle call are the same as
without it. The row qualifies only when nothing in it depends on more than those values:
- only elements, text, `@` expressions and `<text>` — no `@if`/`@foreach`/`@switch` or `@{ … }` inside,
  no `@ref`, `@attach`, `@attributes`, `@bind` or event modifiers, no `@key` below the row's own;
- expressions without visible effects — no assignment, `++`/`--`, `await`, `delete` or `yield`
  (calls are fine; they still run once per render, only before the row's frames are written);
- child components in the row get only value parameters — no child content, callbacks, delegates or
  `@key`/`@ref` — and a row is reused only while those values are primitives (`string`, `number`,
  `boolean`, `bigint`, `null`, `undefined`; a declared object type rules the row out at compile
  time). Blazor does not re-render a child whose primitive parameters are unchanged either, but it
  does re-render one with an object parameter — so such a row is always built;
- content that is a `RenderFragment` is never reused (a fragment builds frames of its own).

A handler closure H1 cannot make stable (a `let` capture) is new every render, so its row is built
every time. Typed shadows, `renderHints: false` and `optimize: false` emit today's code. Selecting
one row among 11k: ~13.5 → ~8 ms.

**Stable child content (H4).** In C#, a child content lambda that uses only `this` is
an equal delegate on every render, and Blazor's `SectionOutlet` (behind `<HeadContent>` and
`<SectionContent>`) keeps its content's DOM and components while the fragment stays equal. A JS
arrow function is a new object every render. Tsazor chooses to cache child content whose body uses
no local declared outside it on the component (`this[slot] ??= (__builder) => { … }`), so it is the
same function on every render: a page that re-renders keeps its head's stylesheets instead of
removing and re-adding them. Child content that uses an outer local (a loop variable, a markup local,
an enclosing template's `context`) stays a new closure per render, as in C#. Fragments you write by
hand in TypeScript follow the same rule only if you keep one function per instance (a field), as
Blazor's method groups do. This is parity, not an optimization: `renderHints: false` keeps it, only
`optimize: false` turns it off. Details: [design-render-hints.md](design-render-hints.md).

**`optimize: false`.** One switch (compiler and Vite plugin) turns off every invisible compiler
optimization — today `staticMarkup` and `renderHints`: the generated code is then what Razor would
generate. It is a diagnostic and emergency switch (A/B measurements, isolating a suspected
optimizer bug), not a recommended mode. It turns stable child content (H4) off too, so section
content is then rebuilt on every render of its component.

## @import

`@import` is followed by the syntax of a TypeScript import declaration — the compiler parses
it with the TS parser (syntactically) and emits it as a real module import:

```razor
@import { Status, formatDate as fmt } from "./utils"
@import Api, { MAX_ITEMS } from "./api"
@import * as icons from "./icons"
@import type { Order } from "./models"
@import "./print.css"
@import {
    PIZZA_MINIMUM_SIZE,
    PIZZA_MAXIMUM_SIZE,
} from "./models"

<p>@Status.Open · @fmt(order.date) · max @MAX_ITEMS</p>
```

- **Free names:** every imported local binding stays unchanged in markup, `@{ }` and
  control headers (`@Status.Open`, not `this.Status.Open`) — see
  [Members and free names](#members-and-free-names). Exception: a declared member
  with the same name (`@inject NavigationManager NavigationManager`, `@Parameter() Status`)
  is a member.
- **Inheritance:** `@import` in `_Imports.tsazor` applies to all files below it (like `@using`).
  Relative specifiers are written relative to the `_Imports.tsazor` and are rewritten per file
  (`"./utils"` in `src/` ⇒ `"../utils"` for `src/Pages/X.tsazor`); package
  and absolute specifiers stay as they are. A binding in the file itself shadows an inherited one,
  a nearer `_Imports` level shadows a more distant one.
- **Components:** an imported value can be used directly as a tag
  (`@import Badge from "./widgets/Badge.tsazor"` ⇒ `<Badge />`), without `@using`.
- The build (esbuild) removes unused imports; a standard set in `_Imports.tsazor`
  costs nothing. Invalid forms (`@import X`, `@import x = require(…)`, missing brace, …)
  ⇒ error TZS016.
- The only things not imported this way are what the compiler itself needs for the generated code:
  `ComponentBase`/`RenderTreeBuilder`/`EventCallback`/`Parameter`/`inject` (unless an
  `@import` already binds them), resolved component tags and `@inject`/`@inherits` types.
  The generated code itself uses hygienic aliases (`__tsazor_EventCallback`, builder
  parameter `__builder`, …) — a local, member or `@import type` with the same name does not
  collide.

## Members and free names

C# allows members without `this.`, TypeScript does not. The compiler parses every markup expression,
every attribute value, every control header and every statement run in code contexts with the
TS parser (syntactically, without the type checker) and decides per identifier reference:

| The name is … | Result |
|---|---|
| local: parameter (including destructuring; default values see the outer scope), `const`/`let`/`var`, `function`/`class`/`enum`, loop variable, `catch` parameter, label | unchanged |
| a declared member: `@code` class body, code-behind class (`X.tsazor.ts`), `@inject` field | `this.X` (static: `ClassName.X`) — even if an import or global has the same name |
| bound via `@import` (own file or `_Imports` chain) | unchanged |
| a JS/DOM global (from TypeScript's `lib.es*.d.ts`/`lib.dom.d.ts`, excluding `@deprecated` ones such as `name`/`status`/`event`) | unchanged |
| anything else (e.g. a member of an `@inherits` base class) | `this.X` |

Never rewritten: property names (`a.b`, `a?.b`), object keys, declarations and
type positions (`as T`, `<T>x`, `satisfies T`, generics, annotations, `typeof x` in a type);
string, template, regex and number literals are tokens of their own (`${…}` spans are
rewritten). Shorthand is expanded: `@save({ id })` ⇒ `this.save({ id: this.id })`,
`new Foo()` ⇒ `new this.Foo()` (member) or unchanged (import). Inside a local
`function` or an object method, `this` does not point to the component — there the
compiler uses the captured component. Unknown free names are not a
compile error (they become `this.X`; a name that does not exist on the component is reported by
the type layer — TS2339 in the language server and in `tsazor check`, see
[Typed shadows](#typed-shadows-and-tsazor-check-24)).

- Loop headers are emitted as written: with `let`/`const`, each iteration has
  its own variable — deferred ChildContent sees the value of its iteration. `var` keeps
  its TS meaning (one function-scoped variable for the whole render method, all
  ChildContents see the final value) ⇒ warning TZS022.
- Method groups: `@onclick="handler"` binds to the component (re-render afterwards);
  `@onclick="item.toggle"` calls `toggle` on `item` (receiver evaluated at render time,
  like a C# delegate), and the component re-renders afterwards.
- Mixed attribute values: `class="btn @(cond ? "on" : null)"` — `null`/`undefined` becomes empty.

## Expressions

- `@expression` — implicit: identifier + dot chains + balanced calls; ends conservatively
  at whitespace/`<`/`>`. Use `@(...)` when in doubt.
- `@(expression)` — explicit.
- `MarkupString` (3.3) — raw HTML: `@(new MarkupString(html))` and `@(html as MarkupString)`
  (the counterpart of C#'s `(MarkupString)s`) are baked by the compiler directly into a markup frame emission
  (`addMarkupContent`) — the content renders **unescaped**; normal `@` expressions stay
  escaped (Blazor semantics). Requirement: `@import { MarkupString } from "@tsazor/runtime"`
  (an alias is allowed); the same name from a different module is not rewritten. Hand-built
  trees pass `MarkupString` instances to `addContent` — the runtime unwraps them into markup frames
  (dynamic values; the diff compares the markup text), `toString()` returns the value.
- Email rule: an `@` directly after an alphanumeric text character is literal
  (`info@example.com`, also in attribute values).
- `@* … *@` — Razor comment (anywhere, multi-line, may contain markup and `@`).
- `<text>…</text>` — markup escape zone.
- Attributes: `Name="@expr"`, events `@onclick="handler"` with the modifiers
  `@onclick:preventDefault` / `@onclick:stopPropagation`, `@key="…"`, `@ref="…"`.
  A modifier is an attribute of its own (Blazor's `__internal_preventDefault_onclick`), not a
  handler: `@onclick:preventDefault="cond"` takes a bool expression that is re-evaluated on every
  render (no value = `true`), and it works even without a handler
  (`<form @onsubmit:preventDefault>`). On a component it is an ordinary attribute
  that the component puts on its element via `@attributes` (`captureUnmatchedValues`) — as in Blazor.
  Unknown or duplicate modifiers ⇒ TZS008.
  Unquoted values (`type=checkbox`) work as in HTML; a valueless attribute (`disabled`) is
  passed as `true`, as in Razor. Unquoted, directly parenthesized values
  (`href=@("a" + id)`) are explicit expressions, as in Razor (Roslyn binds `@(`
  independently of the markup; 2.5 — previously a TZS009 cascade where the `(` remainder was
  interpreted as another attribute; unbalanced parentheses ⇒ TZS003).

## @attach (Tsazor extension)

```razor
<input @attach="autofocus" />
<button @attach="tooltip" @attach:shortcut="saveShortcut">Save</button>

@code {
    autofocus: Attachment<HTMLInputElement> = (input) => input.focus();
}
```

Svelte 5's attachments (F2 in [design-svelte-features.md](design-svelte-features.md)): a function
that receives the element once it is in the DOM and may return a cleanup. Blazor has no
counterpart; there you write `@ref` + `OnAfterRenderAsync` + `IAsyncDisposable` — which works
unchanged in Tsazor. `@attach` ties the cleanup to the element's lifetime instead.

- **Type:** `Attachment<E extends Element = Element> = (element: E) => void | (() => void)`
  (`@tsazor/runtime`). In typed shadows and `tsazor check` the value is checked against the tag's
  interface (`Attachment<HTMLInputElement>` on `<input>`, `SVGElementTagNameMap` for SVG, `Element`
  for unknown tags), so a lambda's parameter is typed and a wrong function is a type error.
- **When:** after the render batch's DOM edits, in the same phase as `onAfterRender` (before those
  calls), in document order within a component (parent passes before their children).
- **Cleanup:** the returned function runs when the element is removed (also with an ancestor),
  the component is disposed (before its `dispose`), or the attachment's value changes.
- **Identity:** the value is compared by identity. The same function on the next render does
  nothing; a different function cleans up the old attachment, then runs the new one;
  `null`/`undefined`/`false` means no attachment. A member method (`@attach="select"`) is bound to
  the component like a delegate parameter, the same bound function every render. A factory call
  (`@attach="tooltip('Save')"`) creates a new function every render and therefore **re-attaches
  every render** — as in Svelte 5: hold the attachment in a field
  (`saveTip = this.tooltip("Save")`) or memoize the factory.
- **Several per element:** `@attach` plus any number of `@attach:<name>` (Razor's
  directive-attribute parameter syntax, as in `@bind:event`); each one has its own value and
  cleanup. A name twice on one element ⇒ TZS008.
- **Errors:** an exception from an attachment or its cleanup is a failure of the component,
  routed like an `onAfterRender` error (nearest `ErrorBoundary`). `@attach` without a value ⇒
  TZS009; on a component tag ⇒ TZS008 (attachments are for elements — a component takes an
  `Attachment` parameter and attaches it to its own element).
- **Render hints:** an element with `@attach` is never a static markup block (F1a), and a keyed
  row containing one is always built (H2).
- Hand-written render code: `addAttachment(builder, sequence, "@attach", value)`; the attachment
  support is only bundled when used.

## @transition, @in, @out (Tsazor extension)

```razor
@import { fade, fly } from "@tsazor/runtime/transition"

@if (visible) {
    <p @transition="fade">Fades in and out</p>
    <p @in="fly({ y: 200, duration: 600 })" @out="fade">Flies in, fades out</p>
    <p @transition="fade" @transition:global>Also when the component comes and goes</p>
}
```

Svelte's transitions (F4 in [design-svelte-features.md](design-svelte-features.md)). Blazor has
no counterpart; there you add and remove CSS classes yourself and delay the removal with a timer.

- **Directives:** `@in` plays when the element enters the DOM, `@out` when it leaves,
  `@transition` both — and it is reversible: removed during its intro, it plays back from where
  it is. `@transition` together with `@in`/`@out`, or a directive twice ⇒ TZS008.
- **Value:** a `Transition<E> = (element: E, options: { direction }) => TransitionConfig | (() =>
  TransitionConfig)` (`@tsazor/runtime`), checked against the tag's interface like `@attach`.
  Parameters are bound by a call: `fly({ y: 200 })`. The value is read when the transition
  starts, so a new function every render costs nothing. `null`/`undefined`/`false`: none.
- **Config** (Svelte's contract): `delay`, `duration` (default 300 ms), `easing`, and either
  `css: (t, u) => string` — sampled into keyframes and played with the Web Animations API, off
  the main thread — or `tick: (t, u) => void`, called every animation frame. `t` runs 0 → 1 for
  an intro, 1 → 0 for an outro; `u` is `1 - t`. Returning a function defers the config until all
  transitions of the render are known (`crossfade` pairs elements that way).
- **Built-ins** (`@tsazor/runtime/transition`): `fade`, `blur`, `fly`, `slide`, `scale`, `draw`
  (SVG strokes) and `crossfade`, which returns a `[send, receive]` pair: an element leaving with
  `@out="send({ key })"` flies to the one entering with `@in="receive({ key })"`. Each built-in
  works bare (`fade`) or with parameters (`fade({ duration: 200 })`). Easing functions:
  `@tsazor/runtime/easing` (Svelte's set: `cubicOut`, `elasticOut`, `backIn`, …).
- **Leaving:** an element with an outro stays in the DOM until the outro ends, then it is removed;
  a removed parent element waits for the outros inside it. Renders meanwhile don't see it (the
  diff's sibling indexing skips it). Its event handlers stay live.
- **Local by default.** A transition plays when its own component's render adds or removes the
  element — also as part of a larger removed block of that component — but not on the
  component's first render, nor when the component itself is removed. With the valueless
  modifier `:global` (`@in:global`, `@out:global`, `@transition:global`) it plays then too.
  Deviation from Svelte, whose control-flow blocks are separate: Razor's `@if` emits flat frames,
  so an inner block's local transition also plays when an outer `@if` of the same component
  toggles. No intros play in the app's first render batch.
- **Events:** `introstart`, `introend`, `outrostart`, `outroend` on the element, handled with
  `@onintrostart="…"` etc.
- **Reduced motion:** for users with `prefers-reduced-motion: reduce` every transition has
  duration 0 (the end state at once; events still fire). `configureTransitions({ reducedMotion:
  "ignore" })` opts out for motion that carries meaning.
- **Timing:** transitions start at the batch end, after attachments, before `onAfterRender`.
  Without the Web Animations API (test DOMs) `css` is skipped; timing, `tick` and events remain.
- **Errors:** an exception from a transition function is a failure of its component (nearest
  `ErrorBoundary`). On a component tag ⇒ TZS008; without a value ⇒ TZS009; `:global` without its
  directive or with a value, or another modifier ⇒ TZS008.
- **Render hints:** like `@attach` — no static markup block, a keyed row with one is always
  built.
- Hand-written render code: `addTransition(builder, sequence, "@in:global", value)`; the
  transition support is only bundled when used.

## @animate (Tsazor extension)

```razor
@import { flip } from "@tsazor/runtime/animate"

<ul>
    @foreach (var todo in todos) {
        <li @key="todo.id" @animate="flip">@todo.text</li>
    }
</ul>
```

Svelte's animations (F5): when a keyed list changes, the rows that moved slide from their old
place to the new one (FLIP).

- **Where:** only on a keyed row of a loop — an element directly inside `@foreach` (or `@for`)
  that has `@key`; anywhere else ⇒ TZS008.
- **Value:** an `Animate<E> = (element: E, rects: { from: DOMRect; to: DOMRect }) =>
  TransitionConfig`, the same config as a transition (played 0 → 1). `flip` from
  `@tsazor/runtime/animate` is the built-in (`flip` or `flip({ duration: 300 })`).
- **When:** a row's box is measured before the render changes its list and again after it; a
  row whose box changed is animated. A new row or a leaving row doesn't animate — combine with
  `@in`/`@out` for those. A leaving row with `@animate` is taken out of the flow (absolute, in
  place) during its outro, so the others move into the gap at once.
- Hand-written render code: `addAnimate(builder, sequence, value)`.

## Code contexts (code-first, like Razor)

In `@{ … }` and in the bodies of `@if`/`else`, `@for`, `@foreach`, `@while`,
`@do … while`, `@switch` and `@try`/`catch`/`finally`, the content is **TypeScript**
(scanned with the TS lexer — strings, template literals, comments and regexes are safe).
Markup only starts

- at a tag in statement position (`<p>…</p>`, `<Comp />`),
- at `@:` (the rest of the line is markup, including `@` transitions),
- at `<text>…</text>`,
- at `@expr` / `@(expr)` (output).

```razor
@foreach (const item of items) {
    const label = item.name.toUpperCase();
    if (item.active) {
        <li>@label</li>
    } else {
        @:inactive: @label
    }
}
```

- Locals (`const`/`let`/`var`, including destructuring, `function`), loop variables and
  `catch` parameters are visible to subsequent markup in the same scope. `@{ }` does not open
  a scope of its own (Razor) — its locals apply to the following markup.
- Whitespace in code contexts is not rendered (`@foreach (…) { <li/> }` produces no
  whitespace text frames).
- Bare text in a code context is an error (TZS015), not silent text.
- `@foreach` headers are TypeScript: `const x of xs` (also `let`, destructuring
  `const [k, v] of pairs`, `const { a } of rows`; without a type annotation, as in TS) and
  `const k in obj` — `for…in` iterates over the **keys**, as in TS. C# headers ⇒ error TZS021
  with the TS form: `var x in xs` / `string s in xs` ⇒ `const x of xs`, `var (k, v) in pairs` ⇒
  `const [k, v] of pairs`. A counting header (`let i = 0; …`) belongs to `@for` (TZS015).
- `@for (…; …; …)`, `@while`, `@do` are plain TS; `var` in loop headers and
  statements ⇒ warning TZS022 (see above); it is emitted as written.
- `@switch` has TS semantics: all sections share the case block (one lexical scope),
  and a section without a terminating `break`/`return`/`throw`/`continue` falls through into the next
  — there is no implicit `break`. A non-empty section that falls through ⇒ warning TZS023
  (like TS's `noFallthroughCasesInSwitch`); stacked empty labels (`case 1:\ncase 2:`) and the
  last section stay silent. A block of its own (`case 1: { … break; }`) is normal TS.
- C# constructs without a TS equivalent — `@using (…) { }`, `lock (…)`, `@await` in markup —
  are errors (TZS012).

## @bind (Blazor .NET 7 semantics)

| Syntax | Generates |
|---|---|
| `<input @bind="name">` | `value` attribute + `onchange` handler with assignment |
| `<input type="checkbox" @bind="flag">` | `checked` + handler |
| `<input type="number" @bind="n">`, `type="range"` | `Number()` coercion; empty or unparsable text keeps the model value (Blazor: `TryParse` fails — `Number("")` would be 0) |
| `<input type="date" @bind="d">` | `Date` through the format `yyyy-MM-dd` (Blazor's default for date inputs): renders `formatValue(d, "yyyy-MM-dd")`, parses back as a local date; an explicit `@bind:format` replaces the default |
| `@bind:event="oninput"` | A different DOM event |
| `@bind:culture="c"` | E8: culture-aware *number* bind — renders/parses through `Intl` with the culture's separators; anything else warns TZS008 and stays invariant |
| `@bind:get="v" @bind:set="store"` | Get/set side instead of `@bind` (only as a pair) |
| `@bind:after="changed"` | Called after the assignment; a promise is awaited, then the component renders |
| `<input @bind-value="name">`, `@bind-value:event="oninput"` | On an *element*, `@bind-<attr>` binds the attribute `<attr>` (Razor: `@bind-value` = `@bind` spelled out) with `onchange`; modifiers and `number`/`date` coercion as with `@bind`; the value comes from the change event (`checked` for checkboxes, otherwise `value`) |
| `<Stepper @bind-Value="current" />` | `Value` + `ValueChanged` (EventCallback) |
| `<Stepper @bind-Value="v" @bind-Value:after="f" />`, `@bind-Value:get`/`:set` | The same modifiers on components |
| `<Stepper @bind-Value="v" @bind-Value:event="OnPick" />` | Change-callback parameter `OnPick` instead of `ValueChanged` (Blazor) |
| `<InputText @bind="name" />` | Component tag ⇒ same as `@bind-Value` |
| `@Bindable() accessor Value = 0` (in the component) | Tsazor extension: declares `Value` + `ValueChanged` in one line; `@bind-Value` works unchanged — see [Two-way parameters](#two-way-parameters-bindable-tsazor-extension) |

**Bind target:** the expression must be assignable — checked on the TS AST; the assignment targets
exactly this expression (after the member rule): fields, member paths, non-null assertions
(`Model!.Title`, `a.b!.c`), element accesses (`items[i].name`, `map[key]`), parentheses and
type assertions. Optional chaining (`a?.b`) is never assignable (TS2779) ⇒ TZS008, and neither are
non-lvalues (`f()`, `a + b`). Also TZS008 (at compile time instead of only at runtime): a
bind to a non-assignable local — `const` (TS2588), `function`/`class`/`enum`, an
`@import` (TS2632, unless a member has the same name) — and to the variable of a
`for…of`/`for…in` loop (C#: CS1656; also with `let`: the assignment would only hit this
iteration's copy and be lost on the next render). Bind to a member instead (`item.name`)
or via an index (`@for (let i = 0; …)` + `items[i]`). `ValueExpression` (the field name for `EditContext`) is the last
member name of the path (`Model!.Title` ⇒ `"Title"`, `map["k"]` ⇒ `"k"`), also from `:get`.

**Combinations** (Blazor .NET 7, RZ10004/RZ10015–RZ10019) ⇒ TZS008: `@bind` together with
`:get`; `:get` without `:set` and vice versa; `:set` together with `:after` (call the `:after` code from
`:set` instead); `:after`/`:event`/`:format` without `@bind` or `:get`. The order of the
attributes does not matter.

**`@bind:format` (3.7)** renders and parses number/date binds through a dedicated
`formatValue`/`parseValue` implementation (a subset of Blazor's `BindConverter`, invariant culture
per A5/B7 — culture enters only through `@bind:culture`, see
[Localization](#localization-cultureservice-stringlocalizer-bindculture)). The value follows
Razor: `@bind:format="0.00"`
is a string literal (plain text in the attribute), `@bind:format="@fmt"` is an expression. Supported
formats — a subset, a documented deviation from the full .NET format grammar:

- Numbers: `F<n>` (fixed digits), `N<n>` (thousands grouping) and the digit masks
  `0`, `0.00`, `#,##0.0` (number of digits taken from the mask, grouping as soon as it contains `,`).
  Everything else formats like `String(value)` and parses leniently (`Number` without `,`/spaces).
- Dates: the tokens `yyyy`, `yy`, `MM`, `dd`, `HH`, `mm`, `ss`, `M`, `d`, `H`, `m`,
  `s`; every other character is literal text (`dd.MM.yyyy`). Parsing uses a regex built from the
  format; an out-of-range value (`31.02.2024`) yields `null` — the handler keeps
  the previous model value, like the NaN guard of the native number bind.
- Empty text never parses as 0 (`.NET TryParse("")` fails).

Not implemented: integer zero padding (`D5`/`00000#` padding) — a deviation, noted in the
roadmap. Formats apply to `type="number"`, `type="range"` and `type="date"` inputs — the
compiler decides by the element, because it cannot see the field's type. Blazor's idiom of a
*text* input bound to a `DateTime` with `@bind:format="dd.MM.yyyy"` is therefore a string
bind here (warning TZS008, format inert) — a documented deviation. Other binds keep Blazor's behavior: `:format` on a string bind and on
a component bind is a warning TZS008 (the `BindConverter` only applies formats to types
that carry one — strings don't; on components Blazor ignores it), and the native
round trip is kept. `@bind:culture` (E8) applies to *number* binds only; on any other
bind — and on components — it is a warning TZS008 and the bind stays invariant.

**`@bind:culture` (E8)** is the culture-aware number bind: the value renders and parses through
`Intl` with the culture's separators (`<input type="number" @bind="amount" @bind:culture="c" />`
with an injected `CultureService C` and `c = C.current`). Without it everything stays
exactly invariant (A5/B7) — a pure superset. Details and the whole localization surface:
[Localization](#localization-cultureservice-stringlocalizer-bindculture).

## DI — ServiceCollection and lifetimes (3.8)

`@inject NavigationManager Nav` is the markup counterpart of the field initializer
`inject(NavigationManager)` — resolved when the component is constructed (the renderer
activates the provider around instantiation, see `withServices`). Tokens are
classes (identity-based — TS instead of interfaces):

| Registration | Lifetime |
|---|---|
| `register(Foo, (services) => new Foo(services.get(Bar)))` | singleton (default) — instance at the root provider, shared across all scopes |
| `…, { lifetime: "scoped" }` | scoped — one instance per service scope (`createScope()`), Blazor's `AddScoped` |
| `…, { lifetime: "transient" }` or `{ singleton: false }` (old form) | transient — new per resolution |
| `registerType(Foo, options?)` | Factory `new Foo(services)` with the lifetime from the options |
| `registerValue(Foo, instance)` | Constant — disposed by its owner, not by the provider |

- **Scopes** (Blazor's `CreateScope`): `provider.createScope()` derives a scope that shares the
  registrations but caches its scoped services itself; singletons fall through to the
  root provider (one instance app-wide). Scopes of scopes form a chain to the same
  root.
- **Dispose:** the provider releases the instances it created through a factory — in
  reverse creation order (instances with `dispose()`), matching the behavior of Blazor's
  `ServiceProvider` engine. `registerValue` constants stay with their owner (the
  app, for example, disposes its NavigationManager itself — the container would release it
  twice). The root provider also disposes its singletons; a scope's dispose only disposes its
  scoped services and the transients it resolved directly; `get` on a disposed provider throws
  .NET's `Cannot access a disposed object.`.
- **Cycle detection:** a factory that requests the same token again throws .NET's exact
  message `A circular dependency was detected for the service of type 'X'.` (a guard per
  synchronous resolution chain — covers self-references and mutual dependencies alike).
- **Not registered:** `get` throws `Service not registered: X`, `tryGet` returns `undefined`.

## Localization (CultureService, StringLocalizer, @bind:culture)

Blazor's `IStringLocalizer`/`CultureInfo` counterpart, built on `Intl` — no BCL clones. Full
design and the wiring recipe: [design-localization.md](design-localization.md) (decided and
implemented; deviations noted in its §10).

`createTsazorApp` always registers a `CultureService` (invariant by default) and a
`StringLocalizer` (whose `get` returns the key); `localization` configures them, a `services`
registration can replace either:

```ts
createTsazorApp({
  localization: {
    defaultCulture: "de-DE",
    tables: { "de-DE": () => import("./i18n/de-DE.js"), "en-US": enTable },
  },
  // …
});
```

- **`CultureInfo`** — immutable, thin: `name`, `displayName`, `formatNumber`/`formatDate`
  (Intl options as given). `CultureInfo.invariant` (name `""`) formats fixed to `en-US`; a
  malformed tag throws at construction.
- **`CultureService`** — the app-wide culture state (a DI service, not ambient static state).
  Priority: `setExplicit` (URL parameter, host postMessage) wins over `setFromProfile`
  (token response) and locks it out for the service's lifetime; `setDefault` is lowest.
  The URL/profile *wiring* is app code — the recipe is in the design doc.
- **`StringLocalizer`** — `L.get("Welcome", { name: "Ann" })` (not Blazor's indexer: a class
  index signature can't carry methods — bent TS for a C# shape). Placeholders are .NET 8's named
  composite format (`{name}`, `{{` for a literal brace). Fallback chain, never a throw
  (port-finding R.1): current culture's table → default culture's table → the key (dev warning).
  Async loaders (`() => import(…)`) serve the fallback until the table arrives; the arrival
  re-renders. Typed keys come free when the registration parameterizes the localizer with the
  default table's literal type (`PlaceholdersOf` extracts the placeholders per message).
- **Auto-render (Tsazor extension)** — injecting a culture-aware service (`CultureService`,
  `StringLocalizer`) subscribes the component automatically: a culture switch re-renders every
  injector, no `observe()` boilerplate. The same subscription a hand-written `observe` would
  build (coalescing, teardown on dispose); the extension is only *who* calls it. Explicitly
  observing an injected service yourself gets the existing double-subscription dev warning.
  Blazor has no counterpart — it re-renders nothing on a culture change.
- **Validation messages** — the built-in texts localize through the reserved
  `tsazor.validation.<kind>` keys (`tsazor.validation.required`, `tsazor.validation.range`, …)
  with `{displayName}` and the rule's params; a culture switch re-validates exactly the fields
  that hold messages. Per rule, .NET's `ErrorMessage` parity:
  `@Required({ message: "…" })`, `@MinLength(1, { messageKey: "User.NameRequired" })`,
  `@Range(0, 10, { messageFactory: (ctx) => L.get("Order.Rating", ctx) })`.
- **`@bind:culture`** — number binds only (see [@bind](#bind-blazor-net-7-semantics)); display-side
  culture formatting lives on `CultureInfo.formatNumber`/`formatDate`. A5/B7 holds everywhere
  else: routing, query strings and data values stay invariant.

The snapshot trap (design doc §2): text that is *stored* (menu items in data models, navigation
entries) does not change language on a culture switch. Store the **key**, translate at render.

## Components

```razor
<Greeter Name="@name" />
<NavLink Href="/counter">Counter</NavLink>

<EditForm Model="@model" OnValidSubmit="@submit">
    <InputText @bind="model.name" />
    <ValidationMessage For="name" />
    <ValidationSummary />
    <button type="submit">Send</button>
</EditForm>

<Virtualize Items="@items" ItemSize="32" ItemTemplate="@renderItem" />
```

- `Virtualize` renders no element of its own (Blazor): two spacers and the visible items go into the
  parent, and the window is measured against the nearest scrolling ancestor (or the window) — put it
  in a container with a height and `overflow-y: auto`. `SpacerElement` sets the spacers' tag (`tr`
  inside a `<tbody>`, as the DataGrid does). A superseded `ItemsProvider` result is dropped.

- `ErrorBoundary` (3.1) catches errors in its own subtree — render, diff, DOM application,
  lifecycle, synchronous and async `@onclick` handling, `onAfterRender` (Blazor's
  `HandleExceptionViaErrorBoundary`; dispose and batch errors stay fatal, as there). When healthy it
  renders `ChildContent`, when faulted `ErrorContent` — which is typed as `RenderFragment<unknown>`
  (deviation: Blazor uses `RenderFragment<Exception>`); without the slot, the default UI
  `<div class="blazor-error-boundary">` (styled with CSS as in the Blazor template). The
  slot context is named `context` by default:
  `<ErrorContent Context="error">…@error.message…</ErrorContent>`. `maximumErrorCount`
  (default 100, as in Blazor) counts errors between two `recover()` calls; beyond that
  the error is fatal and reaches `renderer.errorHandler`. Custom boundaries inherit from
  `ErrorBoundaryBase` (or implement `IErrorBoundary`: `isErrorBoundary = true` +
  `handleException`); the `onError` hook logs to the console by default (Blazor logs through the
  injected `IErrorBoundaryLogger` — Tsazor does not have this service).

- `DynamicComponent` (3.2) renders a component chosen at runtime (Blazor's
  `DynamicComponent.cs`): `Type` is the component class (one of the tags, imported or
  known from the markup), `Parameters` is a dictionary `{ name: value }` that is passed unchanged
  to the rendered child:

  ```razor
  <DynamicComponent Type="@picked" Parameters="@({ label: "x" })" />
  ```

  The same `Type` updates the child instance (no re-creation), a change of `Type` replaces
  it (dispose + initialization — Blazor diffing). `Instance` captures the rendered
  child instance via reference capture. Only `Type`/`Parameters` are accepted as direct parameters;
  anything else is TZS025 (in markup) or Blazor's runtime error
  `DynamicComponent does not accept a parameter with the name 'X'. To pass parameters …`
  (in hand-built trees). If `Type` is missing (null), the component throws Blazor's
  `DynamicComponent requires a non-null value for the parameter Type.`

- Sections (3.4) — Blazor parity: `<SectionContent SectionName="x">…</SectionContent>` is a
  provider, `<SectionOutlet SectionName="x" />` renders the content of the same identifier
  (`SectionId` with an object instead of `SectionName` also works; both at once or neither is
  a runtime error). "Last added wins" — the most recently rendered provider takes over (a
  provider renders nothing in its own place, and without an outlet nothing at all); when the last
  provider is removed, the outlet falls back to the previous one. Exactly one outlet per
  identifier — a second one throws Blazor's error.
- `HeadContent`/`HeadOutlet`/`PageTitle`/`FocusOnNavigate` (3.4) — the Blazor Web counterparts: the
  runtime (createTsazorApp) mounts a `HeadOutlet` as a second root in `document.head`;
  `<HeadContent>` content ends up there, `<PageTitle>` sets `document.title` as the title section
  (a static prerendered `<title>` is captured on the first render, taken over as the fallback default
  and removed from the head — as in Blazor). `<FocusOnNavigate
  RouteData="@routeData" Selector="h1" />` (in the router context; `RouteData` comes from the router)
  focuses the element on page changes — without `tabindex` it gets `tabIndex = -1`,
  and focus uses `preventScroll`.

- `EditForm` (3.5) — Blazor's `EditForm.cs`: `Model` **or** `EditContext` (both at once
  or neither throws Blazor's error message); `OnSubmit` takes precedence over validation and
  replaces it (combined with `OnValidSubmit`/`OnInvalidSubmit`, the combination error is
  Blazor's message); otherwise the `EditContext` validates and dispatches to `OnValidSubmit` or
  `OnInvalidSubmit`. All three callbacks receive the `EditContext`
  (`EventCallback<EditContext>`), and awaiting the callback happens inside the tracked
  submit handler — `waitUntilIdle` covers an asynchronous `OnValidSubmit`. The `EditContext`
  is supplied as a fixed cascading value (`IsFixed=true`); with a new `Model`, the
  context is recreated and the Blazor region (`OpenRegion(_editContext.GetHashCode())` — here:
  context identity from a WeakMap counter) rebuilds the entire form subtree. The
  `<EditForm>` child receives the context as its slot context (`@context` — ChildContent is
  `(context: EditContext) => RenderFragment`).

- Data-annotation validation (3.6) — Blazor's `DataAnnotationsValidator` plus the
  validation model behind it. Decided per the roadmap recommendation "decorators" (enables
  5.2 schema ⇒ validators): the model declares the rules with TC39 field decorators —
  `@Required()`, `@MinLength(n)`, `@MaxLength(n)`, `@StringLength(max, { minimumLength })`,
  `@Range(min, max)`, `@EmailAddress()`, `@RegularExpression(pattern)`,
  `@Compare("otherField")` — as the counterpart of the DataAnnotations attributes. `<EditForm …><DataAnnotationsValidator />`
  enables them on the context (Blazor's `EditContext.EnableDataAnnotationsValidation`);
  without a cascaded `EditContext` it throws Blazor's error message, and likewise on a dynamic
  context change. Error messages are the exact .NET texts
  ("The name field is required.", "The field age must be between 18 and 99.", …), with the
  field name as display name. Timing as in Blazor: a field change validates exactly that
  field (OnFieldChanged), submit (validate()) validates all annotated fields
  (OnValidationRequested). Multiple rules on one field append their messages in
  declaration order (TC39 calls decorators bottom-up — the read side reverses the order;
  .NET: GetCustomAttributes order). The old function-based `Validators` map
  (`validators: Record<string, (value, model) => string | null>` on `<EditForm>`) remains as an
  adapter for logic a schema cannot express; its messages and the
  decorator messages coexist per field (Blazor's ValidationMessageStore model — each
  provider has its own store). Deviations: no `[Display]` port (the display name is the
  field name), no `AddAsyncValidator` API (asynchronous validation waits in the
  `OnValidSubmit` callback), no `DisableClientValidation`/SSR mapping, and the attribute
  set is the subset listed above — further attributes (e.g. `[Range(typeof(...))]`,
  `CustomValidationAttribute`) via `validators` or custom decorators with the
  `FieldRuleDecorator` signature.

- `InputFile` and `SupplyParameterFromQuery` (3.7) — Blazor's Web counterparts with the same
  deviations as everywhere here: browser objects instead of .NET abstractions.

  - `<InputFile OnChange="@handle" />` opens the file dialog; `multiple` and `accept` are passed
    through as element attributes. The event receives an `InputFileChangeEventArgs`:
    `FileCount`, `GetMultipleFiles(max)` (default `10`, Blazor's limit), `File` (the first
    file, `null` without a selection). The files are native `File` objects instead of Blazor's
    `IBrowserFile` — `name`/`size`/`type` match, `OpenReadStream`/`ReadBuffer` do not
    exist (read the content via `file.text()`/`arrayBuffer()`). The frame order is the same as in
    Blazor's InputFile: attributes, `type="file"` and reference capture before the handler — an
    `@ref` between them does not shadow the following handlers (diff and renderer
    treat attributes, handlers and captures as the element's preamble range; captures
    only fire on a fresh element insertion).

  - `[SupplyParameterFromQuery]` (decorator form `@SupplyParameterFromQuery()`) supplies a field
    from the query string, as in Blazor 8: in any component, not only in a page, and without
    `@Parameter()` (allowed alongside). The renderer supplies it like a cascading value and again
    when a navigation changes it; a component whose value didn't change isn't set again, and one
    its parent re-renders with the new value isn't set twice. Blazor reads the target data type from the
    parameter type; TypeScript does not know the runtime type, hence the option: `{ type: "int" |
    "long" | "bool" | "double" | "float" | "decimal" | "datetime" | "guid" }` (default
    `string`, the same conversions as the route constraints) and `{ multiple: true }`
    (a deviation instead of array detection: the field is an array (`string[] | T[]`) and
    receives one converted value per repetition of the key — Blazor's
    `SupplyParameterFromQuery` behavior for array parameters). As in Blazor: the key is the
    field name (case-insensitive), absent ⇒ `null`, multiple values ⇒ the first, route values
    beat query values for the same field, a failed conversion is Blazor's
    error `Cannot parse the value 'X' as type 'T' for 'Y'.`, an unsupported type is
    `Querystring values cannot be parsed as type 'X'.`.

- `NavLink` compares absolute URIs as Blazor (.NET 8) does: `Href` is resolved against the base
  URI (relative `counter`, root-relative `/app/counter` under `<base href="/app/">`, absolute
  `http://…`) and compared case-insensitively with the current URI. `NavLinkMatch.All`: exact
  (Href may additionally end in `/`; query and fragment of the current URI do not count);
  `Prefix` (default): additionally everything below it, at a separator (`/abc` covers `/abc/def` and
  `/abc?x`, not `/abcdef`). A `Prefix` link to the base (`Href=""`, without `<base>` also
  `Href="/"`) is therefore active everywhere — the home link uses `Match="@NavLinkMatch.All"`.
- An empty attribute value (`href=""`) is the empty string (for element attributes and parameters alike).
- A component's element content → the `ChildContent` parameter; elements that
  name `RenderFragment` parameters (named slots) set exactly that
  parameter (`<Found Context="routeData">…` — see below).
- Unknown attributes → the parameter with `captureUnmatchedValues` (`additionalAttributes`);
  without one ⇒ error TZS025 (see below).

### Two-way parameters: `@Bindable()` (Tsazor extension)

```razor
<button @onclick="() => value++">@value</button>

@code {
    @Bindable() accessor value = 0;
}
```

`@Bindable() accessor value: T = init` is exactly the Blazor pair

```ts
@Parameter() value: T = init;
@Parameter() valueChanged?: EventCallback<T>;
```

plus one behavior: **assigning `this.value` in the component** sets the value and then
invokes `valueChanged` with it. The parent is unchanged — `<Stepper @bind-value="guests" />`,
including `:after`, `:get`/`:set` and `:event`, behaves as with the hand-written pair
(conformance-tested side by side).

- **Parameter writes don't echo.** Values the parent passes are written to the accessor's
  backing slot directly; only local assignments invoke the callback.
- **Equal values invoke nothing** (`Object.is`, so `NaN` equals `NaN`) — no echo loops with
  parents that normalize the value.
- **Fire and forget.** A setter cannot be awaited: the callback runs in the background
  (tracked by `waitUntilIdle`), and its failure takes the event handler error path
  (nearest `ErrorBoundary`, phase `event`, attributed to the component that assigned). Code
  that must await writes `await this.valueChanged?.invokeAsync(v)` — the synthesized member
  is real and typed: in a `.tsazor` the compiler declares it (`declare valueChanged?:
  EventCallback<T>`, no field is emitted); a plain `.ts` class declares it itself if it uses it.
- **Unbound use works** ("uncontrolled"): without a `valueChanged` the value just changes locally.
- **No render of its own.** From an event handler the handler's re-render applies, and the
  parent's re-render passes the value down; from an external source, use `observe` (below).
- **Options:** `@Bindable({ changed: "onPick" })` names the callback parameter differently
  (`@bind-value:event="onPick"`); `@Bindable({ expression: true })` also declares
  `valueExpression?: string` (the field name `InputBase`-style components hand to
  `EditContext`).
- **`accessor` is required.** Standard (TC39) field decorators cannot intercept
  assignments, auto-accessor decorators can; `accessor` is standard TypeScript (5.0+).
  `@Bindable()` on a plain field is error **TZS030** with the quick fix "Insert 'accessor'"
  (at runtime the decorator throws).
- **Metadata (2.1):** the accessor contributes both parameters (the callback as
  `EventCallback<T>` of the runtime, `T` from the annotation or the literal initializer), so
  `@bind-value` resolves, TZS025 applies to unknown targets, and the bound value is
  type-checked in the shadow like any `value`/`string` parameter.
- **Editor:** hover on the member shows the desugared pair; on an explicit
  `@Parameter() x` + `@Parameter() xChanged?: EventCallback<T>` pair the LSP offers the
  refactoring "Convert 'x'/'xChanged' to @Bindable()". The codemod keeps emitting the Blazor
  pair.

### Fields that render: `@State()` (Tsazor extension)

```razor
@code {
    @State() accessor seconds = 0;

    start() {
        setInterval(() => this.seconds++, 1000);
    }
}
```

F6 ([design-state.md](design-state.md)). Assigning a `@State` field is `stateHasChanged()` after
the assignment — so timers, callbacks and messages need no explicit call.

- **Coalesced** like `stateHasChanged()`: a render is queued, several assignments render once,
  `shouldRender()` is consulted; an `Object.is`-equal value does nothing.
- **Shallow:** only assignment to the field counts; `this.items.push(x)` is not seen, write
  `this.items = [...this.items, x]` (or call `stateHasChanged()`). No proxies.
- **Quiet** before the component's first render and while it builds its render tree.
- **`accessor` required** (a field decorator cannot intercept assignments): without it TZS030
  with the fix "Insert 'accessor'"; at runtime the decorator throws. `@State()` together with
  `@Parameter()`/`@Bindable()` is TZS030 too — a parameter is the parent's value.
- Hot reload keeps the value. Blazor has no counterpart; `stateHasChanged()` keeps working.

### External sources: `observe` and `disposeSignal` (Tsazor extension)

```razor
@code {
    protected override onInitialized(): void {
        this.observe(this.Store);                                         // re-render per change
        this.observe({ subscribe: (h) => this.Client.market.tickerUpdated(h) }, (s) => this.last = s); // Sleipnir handlers + onNext
        addEventListener("resize", this.onResize, { signal: this.disposeSignal });
    }
}
```

- **`this.disposeSignal`** — an `AbortSignal` that aborts when the component is disposed
  (before `dispose`/`disposeAsync` run; read after disposal it is already aborted).
  Everything that takes a signal tears itself down: listeners, `fetch`, timers wrapped by hand.
- **`this.observe(source, onNext?)`** subscribes, re-renders on every notification and
  unsubscribes on dispose — Blazor's `IDisposable` + subscribe +
  `InvokeAsync(StateHasChanged)` + unsubscribe in `Dispose`, written once. Sources
  (structural, no imports):

  | Shape | Examples |
  |---|---|
  | `subscribe(listener) → () => void` | Svelte-style stores, Zustand, the ticker's `TickerStore` |
  | `subscribe(observer) → { unsubscribe() }` | RxJS, TC39 Observable |
  | `subscribe(…) → Promise<{ unsubscribe() }>` | async handshakes (Sleipnir events) |
  | `(signal: AbortSignal, notify: (value?) => void) => void` | escape hatch (a timer, anything else) |

  The listener `observe` passes is callable *and* an observer (`next`/`error`/`complete`,
  Sleipnir's `onNext`/`onError`/`onComplete`), so each shape gets what it calls.
- **Rendering:** a notification runs `onNext` (if given), then `stateHasChanged()` — the
  render queue coalesces a burst into one render; `shouldRender` is honoured as usual.
- **Errors:** an exception in `onNext`, a source's `error(…)` and a rejected handshake take
  the lifecycle error path (nearest `ErrorBoundary`, phase `lifecycle`); a throwing
  unsubscribe at dispose is a `dispose` error (fatal, as in Blazor).
- **Teardown:** on dispose every observed subscription ends; a handshake that resolves later
  is unsubscribed immediately, and late notifications are ignored. The return value stops
  observing early. A pending handshake is *not* part of `waitUntilIdle` (a subscription is
  open-ended; it must not stall idle detection).
- **When to call:** in `onInitialized`. After dispose `observe` is a no-op (dev warning); in
  `onParametersSet` it subscribes again on every parameter change — dev mode warns when the
  same source is observed twice (v1: a warning, no deduplication). Dev mode is Vite's
  `import.meta.env.DEV` (also Vitest); elsewhere the warnings are off.
- **Testing:** `@tsazor/testing` has `createFakeStore(initial)` (`set`, `notify`,
  `listenerCount`).
- **Naming:** `observe` and `disposeSignal` are `ComponentBase` members — a component member of
  the same name overrides them (TS2416 in the check).

### Component attributes by parameter type

Like Razor, the compiler lowers a component attribute according to the type of the target parameter
(parameter metadata, Phase 2.1; the name is matched case-insensitively, the emitted name is the
member name: `Appearance="…"` sets `appearance`). Markup stays Razor; the value — where it is code
— is TypeScript:

| Parameter type (category) | Attribute | Value |
|---|---|---|
| `string` (also unions with `string`, literal types) | `Title="5"`, `Title="@x"`, `Title="n: @x"` | `"5"`, `this.x`, template string — as on elements |
| any other value (`number`, `boolean`, objects, arrays, function types, `RenderFragment`) | `Count="5"`, `Enabled="true"`, `Items="people"`, `Interval="@4000"`, `Max="@a + 1"`, `<X Enabled />` | TS expression with or without `@`: `5`, `true`, `this.people`, `4000`, `this.a + 1`, `true`; on a function type a method group is bound (see below) |
| `EventCallback` / `EventCallback<T>` | `OnClick="handle"`, `OnClick="item.toggle"`, `OnClick="() => n++"`, `OnClick="@OnClick"` | `EventCallback` bound to the component (re-render afterwards); a method group with a receiver keeps it (like `@onclick`); an already bound `EventCallback` (passed through) stays unchanged |
| `captureUnmatchedValues` / not declared, but a capture property exists | anything | as written (text as string) |

- Invoking: `await this.onPick?.invokeAsync(value)` for an `EventCallback<T>` (the argument is
  required), `await this.onClose?.invokeAsync()` for a plain `EventCallback` (Blazor's
  argument-less `InvokeAsync()`). `EventCallback` is available in `@code` without an import,
  like `Parameter`.
- A function type that is not an `EventCallback` (`onlyIf?: (n: number) => boolean`, also through
  aliases or `| undefined`) is an ordinary value — regardless of its name; the runtime converts
  nothing (since 2.2). **Method groups are bound there** like a C# delegate: markup is
  Razor, and a method name in the template means "this method of this component" — the same rule
  as for `EventCallback`. `Filter="isVisible"` ⇒ `bindMethod(this, this.isVisible)` (a method declared in
  `@code`/code-behind, or an undeclared and therefore inherited member);
  `Filter="svc.isVisible"` ⇒ bound to `svc` (receiver evaluated at render time, as with
  `@onclick`). Left unchanged as TypeScript: lambdas (`(n) => isVisible(n)`), calls
  (`makeFilter()`), declared fields/accessors that hold a function (`pred = (n) => …`), and
  any other expression. The bound function is cached per (receiver, method) (`WeakMap`) —
  the same reference on every render. Change detection as in Blazor: a delegate is not a known
  immutable type, so the child still re-renders on every parent render; the stable identity
  matters for comparisons in the child (`===`, Set/Map, `removeEventListener`) and for an `EventCallback`
  over a method group with a receiver (`OnClick="item.toggle"`), which now compares equal (Blazor:
  same target + method) and no longer makes the child re-render. Without metadata, or with `uncertain`
  metadata (TZS026), it stays `this.isVisible`.
- An empty value on a non-string parameter (`Count=""`) or a valueless attribute on
  an `EventCallback` ⇒ TZS009; a syntax error in the value ⇒ TZS024.
- `@bind-Value` passes `ValueExpression` (in general `<Target>Expression`) only if the component
  declares that parameter (as in Razor); `Value`/`ValueChanged` or `:event` must exist.
- **Unknown parameter ⇒ error TZS025** ("Component 'X' does not have a parameter 'Y'"), the
  static counterpart of the runtime error (B4) — provided the metadata is complete and the
  component has no `captureUnmatchedValues` parameter. With a close match (edit distance,
  case-insensitive, missing `On` prefix): "Did you mean 'Label'?" plus a fix (rename). The same
  applies to `@onclick` on a component and to event modifiers (`@onclick:preventDefault` needs a
  capture parameter there).
- **Type unknown ⇒ warning TZS026**; the value is passed as before (text as string,
  `@expr` as expression, `On*` values as `EventCallback`): when a parameter is `uncertain` (type
  from a package without a manifest, an import that cannot be followed, no annotation and no literal
  initializer — the message names the reason; a type annotation fixes it), when no manifest /
  no source file describes the component, or when its base class cannot be resolved
  (then only for unmatched attributes, once per tag). Without metadata,
  `<Target>Expression` is omitted as well.
- Cascading: `@CascadingParameter({ type: EditContext })` (by type) or
  `@CascadingParameter({ name: "x" })` (by name) — supplied by `CascadingValue`/`EditForm`.

### Templated components: named slots and template contexts (2.3)

An element that is a **direct** child of a component and whose tag names a
`RenderFragment`/`RenderFragment<T>` parameter of that component is a
child content element (Blazor templates) and is set as that parameter —
it is no longer rendered as `ChildContent` or as a component:

```razor
<Router>
    <Found Context="routeData">
        <RouteView RouteData="@routeData" DefaultLayout="@MainLayout" />
    </Found>
    <NotFound>
        <p class="not-found">Page not found.</p>
    </NotFound>
</Router>

<Table items="@this.rows">
    <HeaderContent>
        <tr><th>Customer</th><th>Total (€)</th></tr>
    </HeaderContent>
    <RowContent Context="row">
        <tr class="orders-row" @onclick="() => this.openDetail(row)">
            <td>#@row.id</td>
        </tr>
    </RowContent>
</Table>
```

- **Slot vs. component** is decided by the parent: the metadata of the
  enclosing component knows the parameter — as in Razor, where child content
  tag helpers bind before components. `<Header>` inside a component with a
  `Header` fragment parameter is that component's slot, even if a component named `Header`
  exists; outside of it (or further down, nested in markup) `<Header>` stays
  that component, or is TZS027 there if it is only known as a slot. Without
  metadata for the parent, a tag stays a component/element (2.2 behavior).
- `RenderFragment<T>`: the context is named `context` by default and is a
  local variable of the slot body (outside a template, `@context` stays
  the member `this.context`). **`Context="x"` on the component** names the
  context of all its `RenderFragment<T>` child contents (component, slot and
  generic `ChildContent`); **`Context="y"` on the slot** overrides it
  for that slot only. The value must be literal — a TypeScript identifier
  (the context type comes from the `typeArgument`; see
  [Typed shadows](#typed-shadows-and-tsazor-check-24); the
  runtime placeholder `unknown` stays `any`). Nested templates with the same
  context name ⇒ TZS029 in the inner one (Razor's suggestion: `Context="another_name"`).
- **Type argument attributes** of a generic component (`TItem="Person"`, one
  attribute per `@typeparam`) are template syntax — not an attribute at runtime:
  the value must be a TypeScript type (otherwise TZS024; empty or mixed: TZS009)
  and is matched against the component's `@typeparam`s.
- **Cascading type parameters** (Blazor's `[CascadingTypeParameter]`): a generic component
  declares `@attribute @CascadingTypeParameter("TGridItem")`, and the components inside its
  content that have a type parameter of the same name, and neither set nor infer it themselves,
  take the grid's. The grid infers `TGridItem` from `Items`; in a column,
  `Property="(o) => o.customer"` then sees `o` as the row type, and `TProp` follows from the
  lambda's return type. The names are string literals of the component's own
  `@typeparam`s (otherwise TZS019). An enclosing tag whose argument stays unresolved hides
  an outer cascade of the same name. The Blazor form
  `@attribute [CascadingTypeParameter(nameof(TGridItem))]` is TZS021 with this rewrite as its
  fix. The decorator does nothing at run time; the cascade is a compile-time matter of the
  typed shadows (`tsazor check`, the editor).
- Loose content next to child content elements (whitespace between
  them does not count) ⇒ TZS027; a slot set twice, or also set
  via an attribute ⇒ TZS028; attributes on the slot other than `Context` (and that only on
  a `RenderFragment<T>`) ⇒ TZS028; a tag that does not name a fragment parameter
  written as a child content element ⇒ TZS028 (a value parameter
  belongs in an attribute); an unknown slot name with complete
  metadata ⇒ TZS025 with a rename fix (also for end tags); a slot as a
  direct child of the wrong component, or nested ⇒ TZS027.
- The element content of a component **without** child content elements stays
  its `ChildContent` — if that is a `RenderFragment<T>`, it takes the
  context (`Context=`, otherwise `context`) and is emitted as a template;
  a component without a `ChildContent` parameter does not accept element content (TZS025).
- **Spelling in TypeScript:** a plain fragment is `RenderFragment` (`@import type {
  RenderFragment } from "@tsazor/runtime"`, usually in `_Imports.tsazor`); Blazor's
  `RenderFragment<TItem>` is written as the function it is, `(item: TItem) => RenderFragment`,
  and called as `@itemTemplate(item)`. (A generic `RenderFragment<T>` reference is recognized
  by the metadata, but the runtime type is not generic — port-findings P.5.)
- **Narrowing does not reach deferred content.** A fragment body is a function that runs
  later, so TypeScript drops the narrowing of a member from an enclosing `@if`:
  `@if (user) { <Card>@user.name</Card> }` is TS2532 in `tsazor check` (the same for
  `<PageTitle>`, slots and templates). Capture the value first — `@if (user) { const current =
  user; <Card>@current.name</Card> }` — or read it through a getter.

### Await (Tsazor extension)

```razor
<Await For="@user">
    <Pending><p>Loading…</p></Pending>
    <Then Context="u">Hello @u.name</Then>
    <Catch Context="err">Failed: @err.message</Catch>
</Await>

@code {
    user = getUser(1);   // a Promise<User>, no async hook needed
}
```

Svelte's `{#await}` as a built-in templated component, so the markup stays Razor (D1 in
[design-svelte-features.md](design-svelte-features.md)). Blazor has no counterpart; there you
keep a field, load it in `OnInitializedAsync` and branch with `@if` — which works unchanged in
Tsazor and stays the better fit when code needs the data too.

- **Parameters:** `For` (`PromiseLike<TValue> | TValue | null`), `<Pending>` (`RenderFragment`),
  `<Then>` (`(value: TValue) => RenderFragment`), `<Catch>` (`(error: unknown) =>
  RenderFragment`). A missing fragment renders nothing (e.g. only `<Then>`).
- **States:** `Pending` while the promise is pending, `Then` with the resolved value, `Catch`
  with the rejection reason. A value that is no promise counts as already resolved (as in
  Svelte); `null`/`undefined` means "no promise yet" and renders `Pending` (deviation from
  Svelte, which renders `then` with `undefined`; it keeps `user?: Promise<User>` fields typed
  as `User`).
- **Identity:** a new promise starts over at `Pending`; a promise that settles after it was
  replaced is ignored (latest wins). The same promise on a re-render changes nothing. After
  the component is disposed, a settlement is ignored (no render).
- **No synchronous peek:** a JavaScript promise's state can't be read synchronously, so an
  already settled promise renders `Pending` for one microtask, then its result. The browser
  doesn't paint in between (nothing flashes), but `Pending`'s content is built once. A promise
  an `<Await>` has already seen settle renders its result immediately (a per-promise
  `WeakMap`).
- **Errors:** a rejection `Catch` renders is no component failure. **Without `Catch`, the
  rejection fails the component** (phase `lifecycle`): the nearest `ErrorBoundary` shows it,
  otherwise `renderer.errorHandler` gets it. Nothing is swallowed silently.
- **Typing:** `TValue` is inferred from `For` through the awaited type (`Promise<User> |
  undefined` → `User`), so the `Then` context is typed; `TValue="User"` on the tag is the
  explicit fallback. The `Catch` context is `unknown`, TypeScript's `catch` semantics; like
  `ErrorBoundary`'s `ErrorContent` context, the check leaves it unchecked, so narrow it yourself
  (`@(err instanceof Error ? err.message : String(err))`) where the reason may not be an
  `Error`.
- **Idle:** the current pending promise counts for `renderer.waitUntilIdle()` (tests,
  `@tsazor/testing`'s `settle`), like an async `onInitialized`; a replaced one stops counting.
- **Not a thenable:** the parameters are write-only (setters), so an `Await` instance (`@ref`)
  has no readable `then` and is never mistaken for a promise by `await` or `Promise.resolve`.

## Typed shadows and tsazor check (2.4)

For every `.tsazor`, the type layer builds a **shadow module** (`<dir>/<Name>.tsazor.gen.ts`,
virtual — it never exists on disk): the generated TS code plus type helpers, which the
language server and `tsazor check` diagnose. Since 2.4 the shadow is
typed:

- **Prop checks per component tag.** Every attribute of a component with
  metadata is emitted as a `satisfies` check object — the component's own parameters
  (`declaredBy === name`) with their declared type, foreign parameters without. Only the
  categories `value` and `string` are checked; `mixedValue` values,
  EventCallback and RenderFragment attributes stay untyped (as in Razor, where
  attribute values pass through the renderer as strings). Diagnostics appear on the
  source line of the `.tsazor`. The value of a component bind (`@bind-Value="x"`,
  `:get`) is checked the same way against the target parameter — for an explicit pair and
  a `@Bindable()` parameter alike.
- **Typed slot contexts.** The slot body of a `RenderFragment<T>` parameter
  gets `context` (or `Context=...`) with the `typeArgument` as its type —
  `context: Person` instead of `any`, including `TItem` inference through the type layer:
  exact, via `TItem[]`, or via the awaited type (`For: PromiseLike<TValue> | TValue` ←
  `Promise<User>`, [`<Await>`](#await-tsazor-extension)). If the
  runtime placeholder `typeArgument === "unknown"` is present (an untyped delegate, e.g.
  Virtualize `itemTemplate`), the context intentionally stays `any`.
- **Typed `@ref`.** Element `@ref`s get their tag type via a cast through the
  `HTML`/`SVGElementTagNameMap` (the TS2740 false positive is gone),
  component `@ref`s via the component reference capture — with import adjustment
  (`rebaseTypeImport`) for imported types. Runtime short refs (the `Element` family)
  get hygienic local names. Shadows re-export the component class
  by name (`export { X }`) so that rewrite-B named imports resolve against the shadows;
  shadows of imported components from other packages are built
  automatically (cascade across package boundaries).
- **`tsazor check`** (`tsazor check [project-root]`, root defaults to the current
  directory, exit 1 on errors) checks in
  two passes: compiler diagnostics + shadow build of all project `.tsazor` files
  (including unsaved files), then TS diagnostics across the complete
  shadow graph — the shadows **and** the real `.ts` sources they pull in below the
  root (code-behind classes `X.tsazor.ts`, imported modules), so a type error in a
  code-behind fails the gate too. In that program a `.tsazor` import of a `.ts`
  file resolves to the component's shadow (`import type Child from "./Child.tsazor"`
  types a `@ref` field as the class), and the tsconfig's own `.d.ts` files
  (ambient/virtual modules) are included. Output `file(line,column) code message` (POSIX, 1-based).
  The Vite plugin can append the same check to the end of the build as `check: true` — errors
  fail the build. In the dev server the same option runs the check in the background (at start,
  then after every `.tsazor`/`.ts` change) and prints the findings to the terminal; it never
  blocks: a type error does not fail a module, and HMR keeps updating (only compiler errors —
  `TZS…` — show the overlay, because the module can't be built).
- **A real `.d.ts` per component.** From the package manifest,
  `componentTypeDeclarations` builds `dist/<Name>.d.ts` for every exported component:
  the component's own parameters with doc comments and their types
  (runtime types via `@tsazor/runtime`), a generic `@inherits` as a
  class generic (`export default class TextInput extends InputBase<string> { … }`) —
  the permissive `export const X: any` index is gone.
- **Ambient types.** `*.tsazor` (default component) and `virtual:tsazor-routes`
  are declared as `@tsazor/vite-plugin/client` — apps add that to
  `compilerOptions.types` instead of copying `types.d.ts`.

## Compatibility .razor ↔ .tsazor

| Construct | Status |
|---|---|
| Markup, component tags, attribute syntax | identical |
| `@page`, `@layout`, `@typeparam`, `@bind` (+modifiers), the `@onclick` family (+modifiers with a value), `@key`, `@ref`, `@inject`, expressions, `@@`, `<text>`, `@code`/`@functions` | identical |
| `@attribute [C# attribute]` | Error TZS021 with the TS form (`@authorize`/`@authorize({ roles, policy })`, TS decorator via `@attribute @x()`) |
| `@foreach (var x in xs)`, `where T : …`, `var`, `@switch` without `break` | C# headers/constraints ⇒ TZS021 (converted by the codemod since 2.5, the same forms available as LSP quick fixes); `var` and fallthrough with TS semantics + warning (TZS022/TZS023) |
| `buildRenderTree` in `@code` | Error TZS020 (like CS0111) |
| `@using` | Component folders/packages instead of namespaces; types/values for markup and `@code` come via `@import` |
| C# code in `@code` | different (→ TypeScript — the whole point) |
| Code in `@{ }` and control bodies | code-first like Razor, but TypeScript; `using (…)`, `lock`, `@await` ⇒ error |
| `@namespace`, `@rendermode`, `@preservewhitespace` | accepted, ignored |
| DataAnnotations validation | Decorators as the counterpart (`@Required()`, `@MaxLength(n)`, … on the model + `DataAnnotationsValidator`); the `validators` map remains as an adapter; a subset of the attributes (3.6) |
| `@bind:format` | Subset (3.7) — number masks `F<n>`/`N<n>`/`0.00`, date tokens (`yyyy-MM-dd` …), invariant culture (A5/B7); a plain-text value is a string literal, `@expr` an expression; on string/component binds warning TZS008 (Blazor's BindConverter behavior); `@bind:culture` on anything but a number bind warns TZS008 too |
| `<InputFile>` | yes (3.7) — `InputFileChangeEventArgs` with native `File` objects instead of `IBrowserFile` (`OpenReadStream` does not exist) |
| `[SupplyParameterFromQuery]` | Decorator `@SupplyParameterFromQuery({ type, multiple })` instead of Blazor's data type detection; any component, no `@Parameter()` needed (Blazor 8); key = field name (case-insensitive), absent ⇒ `null`, `multiple` collects repetitions (3.7) |
| Named child slots (`<Found Context="…">`, `<RowTemplate Context="…">`) | identical (2.3 — see [Templated components](#templated-components-named-slots-and-template-contexts-23)) |
| `@inherits`, partials (code-behind) | `@inherits` yes; code-behind (`X.tsazor.ts`, via inheritance — [docs/code-behind.md](code-behind.md)) yes |
| `@authorize` | yes (Tsazor extension replacing `[Authorize]`; bare or with `{ roles, policy }`; not inherited through `_Imports`) |
| `@implements` | accepted, ignored (TS interfaces are structural) |
| `@attach`, `@attach:<name>` | Tsazor extension ([@attach](#attach-tsazor-extension)); Razor renders an attribute literally named `@attach` |

## Codemod .razor → .tsazor (2.5)

`tsazor codemod <path> [--write]` (`@tsazor/cli`) translates the mechanical C# leftovers of a
`.razor` source and writes the result as a `.tsazor` file **next to** the unchanged `.razor`
(nothing destructive; without `--write` it is a dry run with a report). `path` = a file or directory; the
file tree below it is walked (`bin`/`obj`/`node_modules`/`.git` are skipped);
per file, the report lists the applied fixes, API forms and the remaining diagnostic codes
(a `TZS005×4`-style list); a hard compile failure is reported per file as `CRASH`,
without writing. The exit code is 0 only if files were found; being error-free is not
the goal — remaining findings are the manual remainder (see below).

**What it applies** — the same `fix` payloads that the LSP quick fixes consist of,
until a fixed point is reached (at most 8 passes; fixes and API forms are computed per pass on the same
text and applied together — where an API form falls inside a rewritten
`@foreach` header, the fix wins and the API form follows in the next pass):

| Form | Translation |
|---|---|
| `@foreach (var x in xs)` (also `(string s in xs)`, `(var (k, v) in pairs)`) | `@foreach (const x of xs)` / `const [k, v] of pairs` |
| `$"…{x}…"`, `$@"…"`, `@"…"` | Template literal `` `…${x}…` `` (hole layout `{x,2:C}` is dropped, `@` in the hole is dropped) |
| `@attribute [Authorize(…)]` / `[Route("…")]` / `[AllowAnonymous]` | `@authorize({ roles, policy })` / `@page "…"` / line removed |
| `@typeparam T where T : IItem` | `@typeparam T extends IItem` |
| `var` (TZS022) | `let` |

**PascalCase API forms** are only replaced in markup (outside `@code`/`@functions` — C#
there is left untouched and is ported by hand):

| C# | TypeScript |
|---|---|
| `.ToString()` | `.toString()` |
| `.Length` | `.length` |
| `.ToLower()` | `.toLowerCase()` |
| `.ToUpper()` | `.toUpperCase()` |

`.Count` is deliberately **not** mapped — C# `.Count` is `.size` on a dictionary and
`.length` on a list/array; the call is not mechanical and is left as is.

**What remains:** diagnostics without a fix — TZS005 (unresolved tags: slots of unknown
components, `DynamicComponent` …), TZS024 without a mechanical counterpart
(`(MarkupString)x`, `new { … }`, `out var`, `is (not) null`) and unmapped
`@attribute` lists (among them DataAnnotations — rewrite them by hand as the validation
decorators, `@Required()` etc.), and C# in `@code`. (`[CascadingTypeParameter]` has a
mechanical form since 2026-10-07: `@attribute @CascadingTypeParameter("T")`.)
A known limitation of the template literal fix: a ternary written without parentheses
in an interpolation hole — `$"{x ? "a" : "b"}` is read as in C# (the `:` as the
format separator) and stays truncated (`${x ? "a"}`) — C# itself requires
parentheses there (parity); `@(x ? "a" : "b")` or `{(x ? "a" : "b")}` work.

## Diagnostics

The compiler never fails silently: every problem is a diagnostic with a code (`TZS001`…), a
severity and a source range. **Every code with when it is reported, an example and the fix is on
the reference's Diagnostics page** (`/reference/diagnostics` in the tutorial app), generated from
the compiler's catalog (`packages/compiler/src/diagnostic-catalog.ts`; a test keeps it complete and
compiles each example). `TZS007` and `TZS010` are retired.
Errors show up in the Vite dev overlay, warnings on the console.

**Ranges and fixes (A7):** besides `pos` (start, 1-based line / 0-based column), every diagnostic
(`TszDiagnostic`) carries an exclusive `endPos` — the range of the faulty construct:
the whole `@foreach (…)` header, the directive (without the line ending), the attribute (`@bind="a?.b"`;
a folded modifier such as `@bind:format="…"` has its own range), the tag name
(`TZS005`/`TZS017`), the expression or the token of a syntax error, the opener of a block that is never
closed (`@{`, `{`, `@(`, `<div`). The LSP publishes these ranges.
Diagnostics with a mechanical TS counterpart additionally carry `fix: { title, edits: [{ pos, endPos,
text }] }`, exposed in the LSP as a quick fix (code action):

| Code | Fix |
|---|---|
| `TZS021` `@foreach (var x in xs)` / `(string s in xs)` / `(var (k, v) in pairs)` | Header code ⇒ `const x of xs` / `const [k, v] of pairs` |
| `TZS021` `@typeparam T where T : IItem` | Clause ⇒ `extends IItem` (none for `struct`/`class`/`new` …) |
| `TZS021` `@attribute [Authorize(…)]` / `[Route("…")]` / `[AllowAnonymous]` | Directive ⇒ `@authorize…` / `@page "…"` / line removed (only with one attribute per list, only literal values) |
| `TZS022` `var` | ⇒ `let` |
| `TZS030` `@Bindable() value = 0` | ⇒ `@Bindable() accessor value = 0` |
| `TZS032` a member under Blazor's lifecycle name (`onInitializedAsync`, `OnParametersSet`, `Dispose`, …) | Name ⇒ Tsazor's hook (`onInitialized`, `onParametersSet`, `dispose`); the hook may be `async` |
| `TZS024` C# interpolated string `$"…{x}…"` / `$@"…"` / verbatim `@"…"` | Template literal: holes ⇒ `${…}` (a Razor `@` in the hole is dropped), `{{`/`}}` ⇒ braces, C# layout `{x,2:C}` is dropped (since 2.5; fix only when the string is the cause of the error — TZS024 has no fix otherwise; for the limitation see [Codemod](#codemod-razor--tsazor-25)) |
| `TZS025` unknown component parameter with a close match | Attribute or element name ⇒ suggestion (`Lable` ⇒ `Label`, `<RowTemplat>` ⇒ `<RowTemplate>` including the end tag) |
