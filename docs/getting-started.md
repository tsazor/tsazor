# Getting Started

## Setup

Tsazor-Apps laufen mit Vite (Dev-Server, Build, HMR). Das Plugin kompiliert jede
`.tsazor`-Datei on demand zu einem ES-Modul.

```bash
pnpm install
pnpm demo:dev
```

Die Demo (`apps/demo`) zeigt: Counter (@onclick + State), Routing mit Layout und
NavLink, ein Formular mit Validierung (`@bind` + EditForm), Virtualize über 10.000
Items und FetchData über `TsazorHttp`.

## Projektstruktur

```
my-app/
├── index.html               # <div id="app"> + <script src="/src/Program.ts">
├── vite.config.ts           # plugins: [tsazor()]
└── src/
    ├── Program.ts           # createTsazorApp({ root: App, routes })
    ├── _Imports.tsazor       # projektweite Direktiven (z. B. @layout MainLayout)
    ├── App.tsazor            # Wurzelkomponente (Router)
    ├── MainLayout.tsazor     # Layout (@inherits LayoutComponentBase, @Body)
    ├── MainLayout.tsazor.css # (optional) scoped CSS, nur für MainLayout
    └── Pages/
        ├── Home.tsazor       # @page "/"
        ├── Counter.tsazor    # @page "/counter"
        └── …
```

Optional zu jeder `X.tsazor`-Datei: ein Sidecar-Stylesheet `X.tsazor.css` (CSS Isolation,
[Scoped CSS](scoped-css.md)) und eine Code-behind-Klasse `X.tsazor.ts`
([Code-behind](code-behind.md)).

## Bootstrap

```ts
import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";

createTsazorApp({ root: App, routes });
```

- `routes` kommt aus dem virtuellen Manifest, das das Plugin aus allen `@page`-Dateien
  erzeugt (jeweils Template, Komponente und ggf. Layout).
- `createTsazorApp` baut DI-Container + NavigationManager, rendert die Wurzel in `#app`
  und registriert den HMR-Hook (`globalThis.__tsazor`).

## Component-Resolution

Tags mit Großbuchstaben am Anfang sind Komponenten. Aufgelöst wird — wie in Blazor
über `_Imports.tsazor`:

1. **Eigene Verzeichnis** der Datei (`<Tag>.tsazor` als Geschwisterdatei),
2. **`_Imports.tsazor`-Kette** von der Datei bis zur Wurzel; jede `_Imports`-Ebene
   macht ihre eigenen Geschwister sichtbar und bringt ihre `@using`-Verzeichnisse ein,
3. **Runtime-Built-ins** (`Router`, `NavLink`, `EditForm`, `InputText`, `Virtualize`, …
   aus `@tsazor/runtime`).

`@using`-Formen:

| Schreibweise | Bedeutung |
|---|---|
| `@using ./Shared` | Verzeichnis mit Komponenten, relativ zur `_Imports.tsazor` |
| `@using @tsazor/runtime` | Modul-Specifier; Typen daraus werden per Name aufgelöst |
| `@using MainLayout` | (Tsazor-Erweiterung) macht eine Komponentenklasse in `@code` nutzbar |

## Tests

```ts
import { render } from "@tsazor/testing";
import Counter from "./Pages/Counter.tsazor";

test("increments", async () => {
    const { container, instance } = await render(Counter as never);
    container.querySelector("button")!.click();
    expect(container.querySelector("strong")?.textContent).toBe("1");
});
```

## VS Code

`packages/vscode` enthält die Extension (v0.2.0): TextMate-Grammar (`source.tsazor`)
plus den mitgelieferten Language Server (`@tsazor/lsp`, `--stdio`), der pro Workspace
eine Server-Instanz startet:

- **Diagnostics** live aus dem Compiler (Katalog `TZS001…`)
- **Hover** über Komponenten und Direktiven
- **Go-to-Definition** zu `.tsazor`-Quelldateien
- **Auto-Complete**: Tag-Namen, Komponenten-Parameter (inkl. `@bind-<param>`),
  Direktiven-Keywords und Expression-Members

Zum lokalen Testen: Ordner `packages/vscode` in VS Code öffnen → `F5`
(Extension Development Host). Details: [language-server.md](language-server.md).