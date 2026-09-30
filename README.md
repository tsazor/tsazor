# Tsazor — TypeScript Razor

Tsazor ist ein SPA-Framework, das sich 1:1 an Blazors Architektur orientiert — RenderTree,
Renderer, Lifecycle, Parameter-System, Routing, Forms — aber ohne WASM und C#: TypeScript
ist die primäre Sprache, alles läuft rein im Browser.

`.tsazor`-Dateien verwenden Razor als Markup-Syntax. Der Code in `@code`-Blöcken ist
TypeScript; abgesehen davon sind die Markups weitgehend austauschbar mit Blazors
`.razor`-Dateien.

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

## Feature-Überblick

- **Blazor-Architektur 1:1:** RenderTree, Renderer/Diff, Komponenten-Lifecycle, Parameter
  (`@Parameter()`), Cascading, DI, Routing mit Layouts, EditForm/`@bind`-Validierung,
  Virtualize.
- **Scoped CSS:** `X.tsazor.css` als Sidecar-Stylesheet, Selector-Rewriting per postcss,
  `::deep` wie in Blazor ([docs/scoped-css.md](docs/scoped-css.md)).
- **Code-behind:** `X.tsazor.ts` als Sidecar-Klasse (per Vererbung statt partial classes,
  [docs/code-behind.md](docs/code-behind.md)).
- **Language Server:** Diagnostics, Hover, Go-to-Definition und Auto-Complete für `.tsazor`
  ([docs/language-server.md](docs/language-server.md)).
- **Debugging in DevTools:** Inline-Sourcemaps binden `.tsazor` an die echte Quelle —
  Breakpoints in `@code` und Variablen-Inspektion funktionieren im Browser
  ([docs/debugging.md](docs/debugging.md)).

## Quickstart

```bash
pnpm install
pnpm demo:dev        # Demo-App (Vite Dev-Server mit HMR)
pnpm -r build        # alle Pakete bauen
pnpm -r test         # alle Tests (Vitest + happy-dom)
```

Realer Härtetest 1: **[Blazing Pizza](apps/blazing-pizza)** (Port der Blazor-Workshop-App,
Details in [docs/port-findings.md](docs/port-findings.md)):

```bash
pnpm --filter blazing-pizza server   # API auf :5300
pnpm --filter blazing-pizza dev      # App auf :5301
node apps/blazing-pizza/scripts/verify-pizza.mjs   # E2E (startet/kills Server selbst)
```

Seed-Login: `test@example.com` / `test1234`.

Realer Härtetest 2: **[Sleipnir Ticker](apps/sleipnir-ticker)** — Live-Daten statt Forms:
eine ASP.NET-Core-API relaisiert Binance-WebSocket-Ticker-Daten als Sleipnir
Command-API, das Tsazor-Frontend rendert sie per SSE-Push live:

```bash
pnpm --filter sleipnir-ticker api    # API auf :5310
pnpm --filter sleipnir-ticker codegen   # generierten TS-Client in src/api/ regenerieren
node apps/sleipnir-ticker/scripts/verify.mjs   # E2E (synthetic-Feed, self-starting)
```

Eine eigene App:

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
import routes from "virtual:tsazor-routes"; // generiert aus allen @page-Dateien

createTsazorApp({ root: App, routes });
```

## Pakete

| Paket | Inhalt |
| --- | --- |
| `@tsazor/runtime` | RenderTree (flaches Frame-Array wie Blazor), Renderer/DomRenderer, Diff, ComponentBase-Lifecycle, Parameter + Cascading, DI, Navigation/Router, Forms/@bind (EditForm, Input*-Familie, Validierung), Data (Virtualize, TsazorHttp) |
| `@tsazor/compiler` | `.tsazor` → TS-Modul: Lexer/Parser/Codegen mit Sourcemaps, Diagnostics (`TZS001…`), Scoped-CSS-Scope-Hash, Code-behind-Erkennung, `@authorize` |
| `@tsazor/vite-plugin` | Vite-Plugin: Transform + Route-Manifest (`virtual:tsazor-routes`) + HMR mit State-Retention + Compiler-Fehler im Dev-Overlay + Scoped-CSS-Rewriter (postcss) |
| `@tsazor/components` | Bootstrap-5-UI-Bibliothek, selbst in `.tsazor` geschrieben (Dogfooding) |
| `@tsazor/lsp` | Language Server: Diagnostics, Hover, Go-to-Definition, Auto-Complete |
| `@tsazor/testing` | `render()`-Testhelper über happy-dom |
| `packages/vscode` | VS Code Extension: TextMate-Grammar + LSP-Client |
| `@tsazor/workspace` | Workspace-Infrastruktur (Package-Build-Chain, Test-Gates) |

## Dokumentation

- [Getting Started](docs/getting-started.md)
- [Sprach-Referenz (.tsazor)](docs/language-reference.md)
- [Architektur & HMR](docs/architecture.md)
- [Scoped CSS (`X.tsazor.css`)](docs/scoped-css.md)
- [Code-behind (`X.tsazor.ts`)](docs/code-behind.md)
- [Language Server](docs/language-server.md)
- [Debugging in DevTools](docs/debugging.md)
- [Port-Findings (Blazing Pizza)](docs/port-findings.md)

## Status

Alle Meilensteine M1–M8 und der Phase-2-Baustein sind umgesetzt:

- **Runtime-Kern bis Data** (M1–M6): RenderTree, Diff, Lifecycle, Parameter/Cascading,
  Routing/Layout, Forms/@bind, Virtualize + TsazorHttp — jeweils mit Akzeptanztests.
- **Tooling** (M7/M8): Vite-Plugin mit HMR und State-Retention, Route-Manifest,
  Diagnostics-Katalog mit Fehler-Overlay im Dev-Server, Demo-App (`apps/demo`).
- **Components-POC** (`@tsazor/components`): Bootstrap 5 in `.tsazor` — Dogfooding des
  Frameworks mit dem Framework.
- **Blazing-Pizza-Port**: reale Workshop-App (Konfigurator, Checkout, Orders) läuft 1:1,
  19/19 E2E-Tests; Gaps und Learnings in [docs/port-findings.md](docs/port-findings.md).
- **Sleipnir-Ticker**: zweite, anders geartete App (Live-Daten statt Forms) — ASP.NET-Core-API
  (NuGet `Sleipnir.Server`) mit `[SleipnirEvent]`-Push, Tsazor-Frontend über den
  **generierten TS-Client** (`sleipnir-codegen`, Typesicherheit aus dem Contract); bindet Tsazor
  ↔ Sleipnir, 15/15 E2E-Checks inkl. Subscription-Survival über Navigation.
- **Scoped CSS & Code-behind**: Blazor-Parität (`b-<hash>`-Isolation, `::deep`;
  `X.tsazor.ts` via Vererbung statt partial classes).
- **Language Server**: Diagnostics, Hover, Go-to-Definition, Auto-Complete (Tag-, Attribut-,
  Direktiven- und Expression-Kontext); VS-Code-Extension v0.2.0.
- **Debugging**: DevTools-Sourcemap-Story am echten Browser (CDP) verifiziert —
  Breakpoints in `@code`, State-Inspektion, Steps auf `.tsazor`-Zeilen.

**Gates:** Package-Tests 180 ✓ · Pizza-E2E 19/19 ✓ · Demo-Regression 31/31 ✓ ·
Scoped-Demo 10/10 ✓ · Code-behind-Demo 5/5 ✓ · Debugging-Verifikation 14/14 ✓ ·
Ticker-E2E 15/15 ✓ (inkl. Live-Updates ohne Polling, Scoped-CSS, Subscription-Survival).

Damit bewusst vertagt (nicht ohne Rücksprache starten): Web Components
(`defineCustomElement`), named child slots, `@bind:format`, typecheck-CLI,
LSP-Rename, published npm layout.
