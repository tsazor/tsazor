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
```

Real-world stress test 1: **[Blazing Pizza](apps/blazing-pizza)** (a port of the Blazor workshop
app, details in [docs/port-findings.md](docs/port-findings.md)):

```bash
pnpm --filter blazing-pizza server   # API on :5300
pnpm --filter blazing-pizza dev      # app on :5301
node apps/blazing-pizza/scripts/verify-pizza.mjs   # E2E (starts/kills the server itself)
```

Seed login: `test@example.com` / `test1234`.

Real-world stress test 2: **[Sleipnir Ticker](apps/sleipnir-ticker)** — live data instead of
forms: an ASP.NET Core API relays Binance WebSocket ticker data as a Sleipnir command API, and the
Tsazor frontend renders it live via SSE push:

```bash
pnpm --filter sleipnir-ticker api    # API on :5310
pnpm --filter sleipnir-ticker codegen   # regenerate the generated TS client in src/api/
node apps/sleipnir-ticker/scripts/verify.mjs   # E2E (synthetic feed, self-starting)
```

Your own app:

```bash
npm create vite@latest my-app -- --template vanilla-ts
cd my-app && npm install @tsazor/runtime @tsazor/vite-plugin
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
| `@tsazor/components` | Bootstrap 5 UI library, itself written in `.tsazor` (dogfooding) |
| `@tsazor/lsp` | Language server: diagnostics, hover, go-to-definition, auto-complete |
| `@tsazor/testing` | `render()` test helper on top of happy-dom |
| `packages/vscode` | VS Code extension: TextMate grammar + LSP client |
| `@tsazor/workspace` | Workspace infrastructure (package build chain, test gates) |

## Documentation

- [Getting Started](docs/getting-started.md)
- [Language reference (.tsazor)](docs/language-reference.md)
- [Architecture & HMR](docs/architecture.md)
- [Scoped CSS (`X.tsazor.css`)](docs/scoped-css.md)
- [Code-behind (`X.tsazor.ts`)](docs/code-behind.md)
- [Language Server](docs/language-server.md)
- [Debugging in DevTools](docs/debugging.md)
- [Port findings (Blazing Pizza)](docs/port-findings.md)

## Status

All milestones M1–M8 and the Phase 2 building block are implemented:

- **Runtime core through data** (M1–M6): RenderTree, diff, lifecycle, parameters/cascading,
  routing/layout, forms/@bind, Virtualize + TsazorHttp — each with acceptance tests.
- **Tooling** (M7/M8): Vite plugin with HMR and state retention, route manifest, diagnostics
  catalog with an error overlay in the dev server, demo app (`apps/demo`).
- **Components POC** (`@tsazor/components`): Bootstrap 5 in `.tsazor` — dogfooding the framework
  with the framework.
- **Blazing Pizza port**: a real workshop app (configurator, checkout, orders) runs 1:1,
  19/19 E2E tests; gaps and learnings in [docs/port-findings.md](docs/port-findings.md).
- **Sleipnir Ticker**: a second, different kind of app (live data instead of forms) — ASP.NET Core
  API (NuGet `Sleipnir.Server`) with `[SleipnirEvent]` push, Tsazor frontend via the
  **generated TS client** (`sleipnir-codegen`, type safety from the contract); connects Tsazor
  ↔ Sleipnir, 15/15 E2E checks including subscription survival across navigation.
- **Scoped CSS & code-behind**: Blazor parity (`b-<hash>` isolation, `::deep`;
  `X.tsazor.ts` via inheritance instead of partial classes).
- **Language server**: diagnostics, hover, go-to-definition, auto-complete (tag, attribute,
  directive and expression context); VS Code extension v0.2.0.
- **Debugging**: DevTools source map story verified in a real browser (CDP) —
  breakpoints in `@code`, state inspection, stepping on `.tsazor` lines.

**Gates:** package tests 180 ✓ · Pizza E2E 19/19 ✓ · demo regression 31/31 ✓ ·
scoped demo 10/10 ✓ · code-behind demo 5/5 ✓ · debugging verification 14/14 ✓ ·
Ticker E2E 15/15 ✓ (including live updates without polling, scoped CSS, subscription survival).

Deliberately deferred for now (do not start without prior agreement): Web Components
(`defineCustomElement`), named child slots, `@bind:format`, typecheck CLI,
LSP rename, published npm layout.
