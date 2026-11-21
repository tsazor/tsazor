# Spike: server-side rendering (2026-10-13)

A small, time-boxed probe the owner asked for — not product code, nothing here ships. SSR is a topic for after
1.0. The question: how far is Tsazor from rendering on the server, and can that server be .NET itself — the
compiler's TypeScript compiled to IL by [SharpTS](https://sharpts.dev/) — instead of Node?

## Run it

```bash
pnpm -r --filter "./packages/*" build     # the packages' dist
node spikes/ssr/build.mjs                  # app/*.tsazor → .build/ (JS for Node, TS for SharpTS)
node spikes/ssr/render-dom.mjs             # part 1
node spikes/ssr/render-string.mjs          # part 2
node spikes/ssr/sharpts/prepare.mjs       # part 3: the runtime's sources, SharpTS's parse gaps rewritten
cd spikes/ssr && dotnet tool restore       #         SharpTS 1.0.12 as a local tool (dotnet-tools.json)
dotnet sharpts sharpts/frames.ts                         # 3a: the runtime's RenderTreeBuilder
dotnet sharpts --decorators .build/sharpts/bundle.ts     # 3b: the compiler's output over sharpts/mini-runtime.ts
```

`app/` is a page with a child component (a parameter and child content), a keyed `@foreach`, a Razor template, an
event handler and `onInitialized`.

## Findings

### 1. The real runtime renders on the server against a DOM shim — works as it is

`render-dom.mjs` runs the unchanged `Renderer` in Node against happy-dom and reads the container's HTML:

```html
<!--bl-tsazor:1--><main class="shop"><h1>Bakery</h1><!--bl-tsazor:2--><section class="greeting"><h2>Hello, Ada!</h2>
<p>You have 2 items in the basket.</p></section><!--/bl-tsazor:2--><ul><li class="dear">Sourdough — 4.50 €</li>…
```

- The only browser global the runtime reads while rendering is `document`.
- About 0.25 ms per render after a 4 ms first render.
- The HTML carries the runtime's component markers (`<!--bl-tsazor:N-->`), as Blazor's prerendered HTML carries its
  own: the anchor a later hydration would need.

### 2. Without any DOM, from the render tree — also works, and is 30× cheaper

`render-string.mjs` serializes `RenderTreeBuilder`'s frames (element subtree lengths make that a short recursive
walk) and renders child components on the way: the same HTML (without markers), about 8 µs per render. The runtime
touches no DOM at import time.

What it skips is what a real **server render mode of the Renderer** would have to bring: the lifecycle as the
runtime runs it (`setParametersAsync`, awaited async hooks, `StateHasChanged` during the first render), parameter
metadata instead of the spike's name matching (a content block arrives as `ChildContent`), DI scopes for
`inject()`, cascading values, and dropping client-only work (events, attachments, `@ref`, transitions). Today the
Renderer constructs its DomRenderer itself; a render target behind an interface (DOM | string) is the seam.

Not probed: hydration (adopting the server HTML instead of rendering over it), streaming, data loading before the
render (`onNavigateAsync`-style), routing on the server.

### 3. SharpTS (TypeScript → .NET IL) — not with 1.0.12

SharpTS resolves the runtime's `.js` import specifiers to its `.ts` sources and follows the import graph, but it
can't take Tsazor's code:

| Step | Result |
|---|---|
| The runtime's sources (`sharpts/frames.ts` over `packages/runtime/src`) | **Parse error**: logical assignment to a private field (`this.#observed ??= new Set()`). Rewritten mechanically (`sharpts/prepare.mjs`), then **10 type errors in tsc-clean code**: narrowing after a guard (`roles` "possibly undefined"), `Math.fround` missing from its lib, `Date`/`RegExp` lib types not matching their own instances, "Class 'ComponentBase' used before its declaration" across a circular import, an "undefined variable" for a hoisted function. `--strict=false` changes nothing, and there is no switch to skip its type check. |
| The compiler's output for `app/` against a 100-line server slice of the runtime (`sharpts/mini-runtime.ts`), separate modules | **Parse error** on `declare private [symbol]?: …` (the render-hint cache slots); dropped, then **type errors**: one class imported twice (`X` and `X as __tsazor_X`) is two types to it; "Class used before its declaration" across modules. |
| The same as one file without imports (`.build/sharpts/bundle.ts`) | **Type errors**: `RenderTreeBuilder` inside a type alias and the class itself are different types to its checker ("expected 'RenderTreeBuilder' but got 'RenderTreeBuilder'"), even with no forward reference left. |

So SharpTS 1.0.12 doesn't run the real runtime, nor even the generated components over a minimal slice: its type
checker rejects valid TypeScript that `tsc --strict` accepts, and it can't be turned off. The project is young and
active (MIT, frequent commits); these are reportable bugs, not design limits — worth a second look after 1.0.

Independently of SharpTS's maturity, two things would stay true: SharpTS keeps JavaScript semantics on its own
object model (`number` is `double`, objects stay JS objects), so a .NET host would run *Tsazor's* runtime, not
Blazor's — no `ComponentBase` from ASP.NET Core, no `[Parameter]` attributes, no `Task` interop documented. And the
server renderer of finding 2 is the real work either way; SharpTS would only change where it runs.

## Recommendation

After 1.0: a server render mode in the runtime (the render target as a seam, the lifecycle as on the client),
hosted in Node first — Vite's SSR, or a small server package — with hydration over the component markers. A .NET
host (SharpTS, or a JavaScript engine embedded in ASP.NET Core) is a later option on top of the same renderer.
