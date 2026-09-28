# Tasor — TypeScript Razor

Tasor ist ein SPA-Framework, das sich 1:1 an Blazors Architektur orientiert — RenderTree,
Renderer, Lifecycle, Parameter-System, Routing, Forms — aber ohne WASM und C#: TypeScript
ist die primäre Sprache, alles läuft rein im Browser.

`.tazor`-Dateien verwenden Razor als Markup-Syntax. Der Code in `@code`-Blöcken ist
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

## Quickstart

```bash
pnpm install
pnpm demo:dev        # Demo-App (Vite Dev-Server mit HMR)
pnpm -r build        # alle Pakete bauen
pnpm -r test         # alle Tests (Vitest + happy-dom)
```

Eine eigene App:

```bash
npm create vite@latest my-app -- --template vanilla-ts
cd my-app && npm install @tasor/runtime @tasor/vite-plugin
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import { tasor } from "@tasor/vite-plugin";

export default defineConfig({ plugins: [tasor()] });
```

```html
<!-- index.html -->
<div id="app"></div>
<script type="module" src="/src/Program.ts"></script>
```

```ts
// src/Program.ts
import { createTasorApp } from "@tasor/runtime";
import App from "./App.tazor";
import routes from "virtual:tasor-routes"; // generiert aus allen @page-Dateien

createTasorApp({ root: App, routes });
```

## Pakete

| Paket | Inhalt |
|---|---|
| `@tasor/runtime` | RenderTree (flaches Frame-Array wie Blazor), Renderer/DomRenderer, Diff, ComponentBase-Lifecycle, Parameter + Cascading, DI, Navigation/Router, Forms/@bind (EditForm, Input*-Familie, Validierung), Data (Virtualize, TasorHttp) |
| `@tasor/compiler` | `.tazor` → TS-Modul: Lexer/Parser/Codegen mit Sourcemaps und Diagnostics (`TZR001…`) |
| `@tasor/vite-plugin` | Vite-Plugin: Transform + Route-Manifest (`virtual:tasor-routes`) + HMR + Compiler-Fehler im Dev-Overlay |
| `@tasor/testing` | `render()`-Testhelper über happy-dom |
| `packages/vscode` | VS Code Extension (Phase 1): TextMate-Grammar für `.tazor` |

## Dokumentation

- [Getting Started](docs/getting-started.md)
- [Sprach-Referenz (.tazor)](docs/language-reference.md)
- [Architektur & HMR](docs/architecture.md)

## Status (M0–M8)

- **M1–M6 abgeschlossen:** Runtime-Kern, Compiler, Parameter-System, Routing/Layout,
  Forms/@bind, Data (Virtualize, TasorHttp) — jeweils mit Akzeptanztests.
- **M7 abgeschlossen:** Vite-Plugin (Transform, Route-Manifest, HMR mit State-Retention),
  VS-Code-TextMate-Grammar, Demo-App (`apps/demo`) mit 5 Routen.
- **M8:** Diagnostics-Katalog + Fehler-Overlay im Dev-Server umgesetzt, Docs (dieses Verzeichnis),
  `@inherits` unterstützt. Phase 2 (LSP, `@inherits`/Partials-Feinschliff, `@tasor/components`
  als dogfooded Bibliothek) folgt.