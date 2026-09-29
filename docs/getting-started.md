# Getting Started

## Setup

Tasor-Apps laufen mit Vite (Dev-Server, Build, HMR). Das Plugin kompiliert jede
`.tazor`-Datei on demand zu einem ES-Modul.

```bash
pnpm install
pnpm demo:dev
```

Die Demo (`apps/demo`) zeigt: Counter (@onclick + State), Routing mit Layout und
NavLink, ein Formular mit Validierung (`@bind` + EditForm), Virtualize über 10.000
Items und FetchData über `TasorHttp`.

## Projektstruktur

```
my-app/
├── index.html               # <div id="app"> + <script src="/src/Program.ts">
├── vite.config.ts           # plugins: [tasor()]
└── src/
    ├── Program.ts           # createTasorApp({ root: App, routes })
    ├── _Imports.tazor       # projektweite Direktiven (z. B. @layout MainLayout)
    ├── App.tazor            # Wurzelkomponente (Router)
    ├── MainLayout.tazor     # Layout (@inherits LayoutComponentBase, @Body)
    ├── MainLayout.tazor.css # (optional) scoped CSS, nur für MainLayout
    └── Pages/
        ├── Home.tazor       # @page "/"
        ├── Counter.tazor    # @page "/counter"
        └── …
```

Optional zu jeder `X.tazor`-Datei: ein Sidecar-Stylesheet `X.tazor.css` (CSS Isolation,
[Scoped CSS](scoped-css.md)) und eine Code-behind-Klasse `X.tazor.ts`
([Code-behind](code-behind.md)).

## Bootstrap

```ts
import { createTasorApp } from "@tasor/runtime";
import App from "./App.tazor";
import routes from "virtual:tasor-routes";

createTasorApp({ root: App, routes });
```

- `routes` kommt aus dem virtuellen Manifest, das das Plugin aus allen `@page`-Dateien
  erzeugt (jeweils Template, Komponente und ggf. Layout).
- `createTasorApp` baut DI-Container + NavigationManager, rendert die Wurzel in `#app`
  und registriert den HMR-Hook (`globalThis.__tasor`).

## Component-Resolution

Tags mit Großbuchstaben am Anfang sind Komponenten. Aufgelöst wird — wie in Blazor
über `_Imports.tazor`:

1. **Eigene Verzeichnis** der Datei (`<Tag>.tazor` als Geschwisterdatei),
2. **`_Imports.tazor`-Kette** von der Datei bis zur Wurzel; jede `_Imports`-Ebene
   macht ihre eigenen Geschwister sichtbar und bringt ihre `@using`-Verzeichnisse ein,
3. **Runtime-Built-ins** (`Router`, `NavLink`, `EditForm`, `InputText`, `Virtualize`, …
   aus `@tasor/runtime`).

`@using`-Formen:

| Schreibweise | Bedeutung |
|---|---|
| `@using ./Shared` | Verzeichnis mit Komponenten, relativ zur `_Imports.tazor` |
| `@using @tasor/runtime` | Modul-Specifier; Typen daraus werden per Name aufgelöst |
| `@using MainLayout` | (Tasor-Erweiterung) macht eine Komponentenklasse in `@code` nutzbar |

## Tests

```ts
import { render } from "@tasor/testing";
import Counter from "./Pages/Counter.tazor";

test("increments", async () => {
    const { container, instance } = await render(Counter as never);
    container.querySelector("button")!.click();
    expect(container.querySelector("strong")?.textContent).toBe("1");
});
```

## VS Code

`packages/vscode` enthält die Extension (v0.2.0): TextMate-Grammar (`source.tazor`)
plus den mitgelieferten Language Server (`@tasor/lsp`, `--stdio`), der pro Workspace
eine Server-Instanz startet:

- **Diagnostics** live aus dem Compiler (Katalog `TZR001…`)
- **Hover** über Komponenten und Direktiven
- **Go-to-Definition** zu `.tazor`-Quelldateien
- **Auto-Complete**: Tag-Namen, Komponenten-Parameter (inkl. `@bind-<param>`),
  Direktiven-Keywords und Expression-Members

Zum lokalen Testen: Ordner `packages/vscode` in VS Code öffnen → `F5`
(Extension Development Host). Details: [language-server.md](language-server.md).