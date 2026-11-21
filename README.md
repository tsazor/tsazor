# Tsazor — TypeScript Razor

Tsazor is a component framework for TypeScript SPAs: a mature component model — render tree
with diffing, lifecycle, parameters, cascading values, dependency injection, routing with layouts,
forms with validation — strict typing with a stability promise, and everything runs purely in the
browser.

`.tsazor` files use Razor as their markup syntax; the code in `@code` blocks is clean TypeScript.

**Coming from Blazor?** The component model is Blazor's, and the markup is largely
interchangeable with `.razor` files, so an app migrates route by route — see
[Migrating from Blazor](docs/migration.md).

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

- **Component model:** RenderTree, renderer/diff, component lifecycle, parameters
  (`@Parameter()`), cascading values, DI, routing with layouts, EditForm/`@bind` validation,
  Virtualize — Blazor's architecture, 1:1.
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
| `@tsazor/primitives` | .NET's value types in TypeScript: `Decimal` (with `@bind` and validation), `DateOnly`, `TimeOnly`, `TimeSpan`, `Guid` — `@tsazor/dotnet` maps to them |
| `@tsazor/worker` | Heavy work off the main thread: typed calls into Web Workers with cancellation, transfer and pools — Tsazor's `Task.Run` |
| `@tsazor/spreadsheet` | A headless spreadsheet model: cells, ranges, undo, copy and paste (the extended library, see [after 1.0](docs/after-1.0.md#the-extended-library)) |
| `create-tsazor` | `npm create tsazor@latest my-app`: an app in the shape of `dotnet new blazorwasm`, with any component library |
| `@tsazor/cli` | `tsazor check` (typed component-usage gate) and `tsazor codemod` (`.razor` → `.tsazor`) |
| `@tsazor/lsp` | Language server: diagnostics, hover, go-to-definition, auto-complete |
| `@tsazor/testing` | `render()` test helper on top of happy-dom |
| `@tsazor/conformance` | Blazor conformance suites for the compiler (render-based golden tests) and the runtime (lifecycle/diff semantics) |
| `packages/vscode` | VS Code extension: TextMate grammar + LSP client |
| `@tsazor/workspace` | Workspace infrastructure (package build chain, test gates) |

## Documentation

- [Getting Started](docs/getting-started.md)
- [Notes for coding agents](packages/create-tsazor/template/AGENTS.md) — every new app carries them as `AGENTS.md`;
  the docs site has an `llms.txt`
- [Migration guide: Blazor → Tsazor at a glance (C# keywords, Razor, Blazor APIs)](docs/migration-guide.md)
- [Migrating from Blazor (side by side, the codemod, the API boundary)](docs/migration.md)
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
- [Supported browsers](docs/browser-support.md) and [the stability promise](docs/support-policy.md)
- The ports: [Blazing Pizza](docs/port-findings.md), [FluentCMS](docs/port-fluentcms.md),
  [BlazorHero](docs/port-blazorhero.md), [fullstackhero's React admin](docs/port-fullstackhero.md)
- [After 1.0](docs/after-1.0.md)

## Status

Version 1.0 is Blazor parity, measured against .NET 11. What checks it:

- **Blazor's own tests.** `apps/blazor-parity` runs Blazor's E2E tests with their test pages, ported: forms,
  Virtualize, QuickGrid and InputFile. The conformance suites pin the compiler's and the runtime's semantics against
  Blazor's (rendering, lifecycle, diff).
- **Four ported apps**, each against its unchanged backend: Blazing Pizza (the Blazor workshop), FluentCMS (Blazor
  Server: its admin and its public site, on `@tsazor/fluent`), BlazorHero (Blazor WebAssembly on MudBlazor: every
  page, eleven languages, right to left, a SignalR chat) and fullstackhero's React admin (Tailwind and shadcn). Every
  gap a port found became a fix with a test; the port reports list them.
- **The gates:** every package's tests; the browser gates in Edge, Firefox and WebKit — the tutorial, the demo under
  a strict CSP, the gallery, both skins, axe in light and dark, the ports; a smoke test of the packed tarballs and a
  release rehearsal through a registry (`pnpm gates`, `pnpm ci:local`).

What comes next: [after 1.0](docs/after-1.0.md).

## License

MIT, see [LICENSE](LICENSE). Code and assets that come from other projects, and their licenses, are listed in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
