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
    ├── _Imports.tsazor       # projektweite Direktiven (@layout, @using, Standard-@imports)
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

## _Imports.tsazor

Das Pendant zu Blazors `_Imports.razor`: Direktiven darin gelten für alle `.tsazor`-Dateien
im selben Ordner und darunter. Wo Blazor `@using Microsoft.AspNetCore.Components` schreibt,
steht in Tsazor das **Standard-Runtime-Set** als `@import` (ungenutzte Imports entfernt der
Build):

```razor
@layout MainLayout
@using ./Shared
@* Standard runtime set (Blazor: @using Microsoft.AspNetCore.Components.*). *@
@import { ComponentBase, LayoutComponentBase, Parameter, CascadingParameter, EventCallback, RenderTreeBuilder, inject } from "@tsazor/runtime"
@import { NavigationManager, Router, RouteView, AuthorizeRouteView, LayoutView, NavLink, NavLinkMatch } from "@tsazor/runtime"
@import { EditContext, AuthenticationState, AuthenticationStateProvider, TsazorHttp } from "@tsazor/runtime"
@import type { RenderFragment, RouteData, ModelValidator } from "@tsazor/runtime"
@* App-eigene Typen/Helfer (Blazor: @using MyApp.Models) *@
@import type { Order, Pizza } from "./models"
@import { formatDate } from "./format"
```

Namen, die Markup oder `@code` verwenden, müssen importiert sein — es gibt **keine**
Import-Inferenz aus Bezeichnern. Eine Komponentenklasse, die `@code` als Wert braucht
(z. B. `DefaultLayout` im Router), wird explizit importiert:
`@import MainLayout from "./MainLayout.tsazor"`. Siehe [`@import`](language-reference.md#import).

## Component-Resolution

Tags mit Großbuchstaben am Anfang sind Komponenten. Aufgelöst wird — wie C#-Typnamen
über Namespaces und `@using`:

1. **Explizit importiert** (`@import X from "./X.tsazor"`) ⇒ genau diese Klasse.
2. **Umschließende Ordner:** das eigene Verzeichnis der Datei, dann die Verzeichnisse der
   `_Imports.tsazor`-Kette (Geschwister sind sichtbar); der nächste Treffer gewinnt.
3. **`@using`-Quellen** als Ganzes: `@using`-Ordner (aus der Datei und der `_Imports`-Kette),
   die Runtime-Built-ins (`Router`, `NavLink`, `EditForm`, `InputText`, `Virtualize`, …) und
   Bare-Paket-`@using`s — ein Paket liefert nur Namen, die sein Entry-Modul wirklich
   exportiert. Findet sich ein Tag in **mehr als einer** Quelle ⇒ Fehler TZS017 (mehrdeutig);
   in keiner ⇒ Warnung TZS005 (wird als Element ausgegeben).

`@using`-Formen:

| Schreibweise | Bedeutung |
|---|---|
| `@using ./Shared` | Verzeichnis mit Komponenten (und `@inject`-Typen), relativ zur Datei bzw. `_Imports.tsazor` |
| `@using @tsazor/fluent` | npm-Paket; Tags/Typen nur aus seiner Export-Liste |

Ein `@using`-Ordner oder -Paket, das nicht existiert, ist eine Warnung (TZS018).
`@inject`-/`@inherits`-Typen werden über dieselben Quellen aufgelöst; ob Default- oder
Named-Import, entscheidet der **tatsächliche** Export der Zieldatei (`.tsazor` ⇒ Default).

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