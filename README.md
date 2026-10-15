# Tsazor — TypeScript Razor

Tsazor is an SPA framework that follows Blazor's architecture 1:1 — RenderTree, renderer,
lifecycle, parameter system, routing, forms — but without WASM and C#: TypeScript is the primary
language, and everything runs purely in the browser.

`.tsazor` files use Razor as their markup syntax. The code in `@code` blocks is TypeScript;
apart from that, the markup is largely interchangeable with Blazor's `.razor` files.

```razor
@page "/counter"

<h1>Counter</h1>

<p role="status">Current count: <strong>@currentCount</strong></p>

<button @onclick="incrementCount">Click me</button>

@code {
    private currentCount = 0;

    private incrementCount() {
        this.currentCount++;
    }
}
```

**Guiding principle:** markup is Razor (1:1 Blazor), code is clean TypeScript — see
[docs/design-principles.md](docs/design-principles.md).

## Feature overview

- **Blazor architecture 1:1:** RenderTree, renderer/diff, component lifecycle, parameters
  (`@Parameter()`), cascading values, DI, routing with layouts, EditForm/`@bind` validation,
  Virtualize.
- **Tsazor extensions (superset, desugar to the Blazor form):** `@Bindable() accessor value`
  (a two-way parameter in one line) and `this.observe(source)` / `this.disposeSignal` (external
  sources bound to the component lifetime) — see the
  [language reference](docs/language-reference.md#two-way-parameters-bindable-tsazor-extension).
- **Scoped CSS:** `X.tsazor.css` as a sidecar stylesheet, selector rewriting via postcss,
  `::deep` as in Blazor ([docs/scoped-css.md](docs/scoped-css.md)).
- **Code-behind:** `X.tsazor.ts` as a sidecar class (via inheritance instead of partial classes,
  [docs/code-behind.md](docs/code-behind.md)).
- **Language server:** diagnostics, hover, go-to-definition and auto-complete for `.tsazor`
  ([docs/language-server.md](docs/language-server.md)).
- **Debugging in DevTools:** inline source maps map `.tsazor` back to the real source —
  breakpoints in `@code` and variable inspection work in the browser
  ([docs/debugging.md](docs/debugging.md)).

## Quickstart

```bash
pnpm install
pnpm demo:dev        # demo app (Vite dev server with HMR)
pnpm -r build        # build all packages
pnpm -r test         # run all tests (Vitest + happy-dom)
pnpm gates           # every browser gate in Edge, Firefox and WebKit (Windows, as CI's browser jobs)
pnpm ci:local        # CI's check job on a fresh clone of HEAD in Linux (in WSL on Windows)
```

Real-world stress test 1: **[Blazing Pizza](apps/blazing-pizza)** (a port of the Blazor workshop
app, details in [docs/port-findings.md](docs/port-findings.md)):

```bash
pnpm --filter blazing-pizza api      # the backend on :5300
pnpm --filter blazing-pizza dev      # the app on :5301
pnpm --filter blazing-pizza verify   # E2E (starts and stops the servers itself)
```

Seed login: `test@example.com` / `test1234`. More (the build, the generated API client) in the
[app's README](apps/blazing-pizza/README.md).

Real-world stress test 2: **[Sleipnir Ticker](apps/sleipnir-ticker)** — live data instead of
forms: an ASP.NET Core API relays Binance WebSocket ticker data as a Sleipnir command API, and the
Tsazor frontend renders it live via SSE push:

```bash
pnpm --filter sleipnir-ticker api    # API on :5310
pnpm --filter sleipnir-ticker codegen   # regenerate the generated TS client in src/api/
node apps/sleipnir-ticker/scripts/verify.mjs   # E2E (synthetic feed, self-starting)
```

Your own app, in the shape of `dotnet new blazorwasm` (layout, nav menu, Home, Counter, Weather, a test):

```bash
npm create tsazor@latest my-app                            # optional: -- --ui <any component library>
cd my-app && npm run dev
```

By hand, in an existing Vite project:

```bash
npm install @tsazor/runtime @tsazor/vite-plugin
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({ plugins: [tsazor()] });
```

```html
<!-- index.html -->
<div id="app"></div>
<script type="module" src="/src/Program.ts"></script>
```

```ts
// src/Program.ts
import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes"; // generated from all @page files

createTsazorApp({ root: App, routes });
```

## Packages

| Package | Contents |
| --- | --- |
| `@tsazor/runtime` | RenderTree (flat frame array as in Blazor), Renderer/DomRenderer, diff, ComponentBase lifecycle, parameters + cascading values, DI, navigation/router, forms/@bind (EditForm, Input* family, validation), data (Virtualize, TsazorHttp) |
| `@tsazor/compiler` | `.tsazor` → TS module: lexer/parser/codegen with source maps, diagnostics (`TZS001…`), scoped CSS scope hash, code-behind detection, `@authorize` |
| `@tsazor/vite-plugin` | Vite plugin: transform + route manifest (`virtual:tsazor-routes`) + HMR with state retention + compiler errors in the dev overlay + scoped CSS rewriter (postcss) |
| `@tsazor/bootstrap` | Bootstrap 5 UI library, itself written in `.tsazor` (dogfooding) |
| `@tsazor/fluent` | Fluent 2 design system: token-driven, accessible components written in `.tsazor` ([docs/fluent.md](docs/fluent.md)) |
| `@tsazor/ui` | The skins' behavior core: focus trap, dismiss, roving focus, positioning, the DataGrid and tree models, `icon()` |
| `@tsazor/fluent-icons`, `@tsazor/bootstrap-icons` | The full icon sets as typed, tree-shaken values: `Icons.Regular.Size20.Save`, `Icons.Save` ([docs/design-icons.md](docs/design-icons.md)) |
| `@tsazor/markdown` | A `Markdown` component on marked, always sanitized with DOMPurify ([README](packages/markdown/README.md)) |
| `@tsazor/charts` | Line, area, bar, donut and pie charts and sparklines as SVG in the skin's colors ([README](packages/charts/README.md)) |
| `@tsazor/dotnet` | .NET backend bridge: OpenAPI ⇒ typed TS client (`tsazor-dotnet generate`), `HttpResult`/ProblemDetails, DataAnnotations decorators, cookie/JWT auth ([README](packages/dotnet/README.md)) |
| `@tsazor/cli` | `tsazor check` (typed component-usage gate) and `tsazor codemod` (`.razor` → `.tsazor`) |
| `@tsazor/lsp` | Language server: diagnostics, hover, go-to-definition, auto-complete |
| `@tsazor/testing` | `render()` test helper on top of happy-dom |
| `@tsazor/conformance` | Blazor conformance suites for the compiler (render-based golden tests) and the runtime (lifecycle/diff semantics) |
| `packages/vscode` | VS Code extension: TextMate grammar + LSP client |
| `@tsazor/workspace` | Workspace infrastructure (package build chain, test gates) |

## Documentation

- [Getting Started](docs/getting-started.md)
- [C# to TypeScript (cheat sheet)](docs/csharp-to-typescript.md)
- [Design principles](docs/design-principles.md)
- [Language reference (.tsazor)](docs/language-reference.md)
- [Authentication (BFF with an HttpOnly cookie)](docs/auth.md)
- [Content Security Policy](docs/csp.md)
- [Architecture & HMR](docs/architecture.md)
- [Scoped CSS (`X.tsazor.css`)](docs/scoped-css.md)
- [Code-behind (`X.tsazor.ts`)](docs/code-behind.md)
- [Fluent components (`@tsazor/fluent`)](docs/fluent.md)
- [Charts and visualizations (a chart library through `@attach`, an SVG of your own)](docs/guide-charts.md)
- [Live data (server events through `observe`, with reconnects)](docs/guide-live-data.md)
- [Language Server](docs/language-server.md)
- [Debugging in DevTools](docs/debugging.md)
- [Bundle size (where the bytes go, against React)](docs/bundle-size.md)
- [Compared to React and Vue (what the numbers contain, how they differ)](docs/compared-to-react-and-vue.md)
- [Port findings (Blazing Pizza)](docs/port-findings.md)

## Status

Phases 0–5 of the [roadmap](docs/roadmap.md) are implemented (as of 2026-10-02):

- **Foundation and runtime core** (Phase 0, tracks A/B): code-first parser with source maps,
  TS-AST rewriting, import model, RenderTree/diff, render queue with batches, lifecycle,
  cascading values, parameter change detection, router/navigation, forms/@bind, Virtualize +
  TsazorHttp.
- **Parameter metadata and type checking** (Phase 2): metadata-driven codegen, templated
  components with named slots and template contexts, typed shadows and `tsazor check`, a
  project-wide language server, and the `.razor` → `.tsazor` codemod.
- **Blazor parity: built-ins and forms** (Phase 3): ErrorBoundary, DynamicComponent,
  MarkupString, Sections/HeadOutlet/FocusOnNavigate, EditForm semantics, validation decorators +
  `DataAnnotationsValidator`, InputFile, SupplyParameterFromQuery, `@bind:format`, scoped DI
  lifetimes with cycle detection.
- **Dev server and component library** (Phase 4): HMR with invalidation and state retention,
  the reworked Fluent library (`@tsazor/fluent`) next to the Bootstrap 5 components
  (`@tsazor/bootstrap`).
- **External use and .NET bridge** (Phase 5): `exports`-complete packages verified by a
  tarball smoke gate (`node scripts/tarball-smoke.mjs`), and `@tsazor/dotnet`.
- **Real-world ports**: Blazing Pizza (configurator, checkout, orders; gaps and learnings in
  [docs/port-findings.md](docs/port-findings.md)) and Sleipnir Ticker (live data via the
  generated Sleipnir TS client and SSE push, subscription survival across navigation).
- **Tooling**: scoped CSS and code-behind with Blazor parity, DevTools debugging via inline
  source maps (verified in a real browser over CDP), VS Code extension v0.6.0.

**Gates** (from [docs/handoff-2026-10-02-phase-complete.md](docs/handoff-2026-10-02-phase-complete.md),
not re-run for this README): 1227/1227 tests (91 files) ✓ · build ✓ · tarball smoke gate ✓ ·
LSP smokes ✓ · app E2E: Pizza 20/20, Gallery, Sleipnir, demo including `verify-hmr.mjs` 19/19 ✓ ·
`tsazor check` 0 findings ✓.

Not implemented (do not start without prior agreement): Web Components
(`defineCustomElement`), LSP rename, publishing the packages to the npm registry (they are
packaged and tarball-tested, but not published).

## License

MIT, see [LICENSE](LICENSE). Code and assets that come from other projects, and their licenses, are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
