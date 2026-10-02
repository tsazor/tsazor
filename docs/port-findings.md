# Port-Findings: Blazing Pizza → Tsazor

Ergebnis des ersten Ports einer realen, nicht-trivialen Blazor-App
(dotnet-presentations/blazor-workshop, MIT) nach Tsazor. Der Port deckt ab:
Specials-Grid, Pizza-Konfigurator, Checkout mit Adressvalidierung, MyOrders,
OrderDetails mit Polling + Leaflet-Karte, Auth (Login/Logout/Registrierung),
Status-Progression (Preparing → Out for delivery → Delivered).

**Ergebnis:** Der komplette Flow läuft E2E durch (`apps/blazing-pizza/scripts/verify-pizza.mjs`,
19 Checks, null Console-Errors). Zwei Lücken wurden compiler-seitig geschlossen
(@authorize, knownGlobals), der Rest sind dokumentierte Abweichungen/Workarounds.

---

## A. Framework-Lücken, die der Port aufgedeckt hat (compiler-seitig geschlossen)

### 1. `@authorize`-Direktive fehlte — **beheb, hinzugefügt**

Blazor-Seiten schützen sich mit einer bare `@authorize`-Direktive; der Tsazor-Compiler
kannte sie nicht.

**Fix:** `packages/compiler/src/parser.ts` (`authorize` in `DIRECTIVE_NAMES`),
`codegen.ts` (`metadata.authorize` → `export const routeAuthorize = true` +
statische Klassen-Member), `packages/vite-plugin/src/routes.ts` (Manifest-Eintrag
`authorize: {}`). Regressionsgetestet in compiler + vite-plugin. Semantik wie
Blazors Default-Policy: authentifiziert = autorisiert.

### 2. Runtime-Enums in Markup wurden nach `this.*` gebacken — **behoben, hinzugefügt**

`Match="@NavLinkMatch.All"` in Markup kompilierte zu `this.NavLinkMatch.All` —
`NavLinkMatch` ist aber ein importierter Runtime-Enum, kein Komponenten-Member.
`bakeMemberRefs` backt *jeden* freien Identifier nach `this.*`, weil zur
Compile-Zeit nicht erkennbar ist, was später per `collectCodeImports` importiert wird.

**Fix:** Neue Codegen-Option `knownGlobals?: ReadonlySet<string>`; der
vite-plugin-Transform prescannt den Quelltext nach `RUNTIME_TYPES`-Identifiern
und übergibt sie. Regressionsgetestet (vite-plugin).

**Stand A3 (2026-09-30):** `knownGlobals` und der Prescan sind entfernt; `NavLinkMatch`
kommt per `@import` aus dem Standard-Set in `_Imports.tsazor` und bleibt dadurch frei.

### 3. Async-Lifecycle-Hooks rendern nicht nach dem `await` — **behoben (B4), Workaround entfernt**

*Korrektur:* Die ursprüngliche Beschreibung war in beiden Punkten falsch. Tsazor awaitete
async `onInitialized`/`onParametersSet` und renderte **einmal am Ende** — ohne
Loading-State (Review R6). Und Blazor verhält sich **nicht** so: `ComponentBase` rendert,
solange der Task des Hooks läuft (nach seinem synchronen Teil), und erneut nach Abschluss
(`RunInitAndSetParametersAsync` / `CallStateHasChangedOnAsyncCompletion`); die Originale
von `Index`, `MyOrders` und `ConfigurePizzaDialog` rufen dort kein `StateHasChanged`. Das
„hängt im Loading"-Symptom stammte vermutlich von Arbeit außerhalb des Hook-Tasks (Fire-and-forget), die
auch in Blazor ein explizites `StateHasChanged` braucht.

**Stand (B4):** Tsazor rendert wie Blazor (Loading-State + Render nach Abschluss). Die
`stateHasChanged()`-Aufrufe nach den awaits in `Index`, `MyOrders` und
`ConfigurePizzaDialog` sind entfernt; `OrderDetails` behält ihn — dessen Poller läuft
fire-and-forget aus `onParametersSet`, wie im Original (`PollForUpdates` + `StateHasChanged`).

## B. Syntax-Regeln, die der Port bestätigt hat (Fallerinnerung, kein Fix nötig)

| Thema | Regel |
|---|---|
| Component-Event-Attrs | Proven form: `OnSelect="@(() => fn())"`. `@() => ...` **ohne** äußere Klammern ist kaputt (parses als expliziter Ausdruck + Text). |
| Element-Handler | Kleinschreibung `@onclick="handlerName"` (bare Name) oder `@onclick="@(() => ...)"`. PascalCase-Element-Attrs funktionieren ebenfalls. |
| `@foreach` | *Überholt (A6a):* der Kopf ist TypeScript — `@foreach (const x of y)`; die C#-Form `@foreach (var x in y)` ist Fehler TZS021 mit dieser TS-Form ([language-reference.md](language-reference.md#code-contexts-code-first-like-razor)). |
| `@@`-Escape | `@@` escape't das @: `placeholder="test@@example.com"` (plain `@example.com` parst `@example` als Expression). |
| `<text>`-Tags | Werden unterstützt (textTag-Node). |
| `@inject` | Nur auf Dokument-Ebene, **nie** innerhalb von `@code` (sonst esbuild-Fehler `Expected ";" but found ...`). |
| `@bind` auf `type="range"` | Coerced nicht zu number — manueller `@oninput`-Handler mit `Number()`-Cast nötig. |

## C. bakeMemberRefs / freie Funktionen — Workaround-Pattern

Alle Markup-/Code-Expressions-Identifier, die keine Locals, Arrow-Params,
KNOWN_GLOBALS, JS-Keywords oder After-Dot-Zugriffe sind, werden zu `this.X`
gebacken — **auch importierte freie Funktionen** (`@orderFormattedTotalPrice(...)`
→ `this.orderFormattedTotalPrice` = undefined).

**Workaround (in der App):** `PizzaComponentBase.ts` — Basisklasse, die die
Helper als `protected readonly` Member bindet; alle Seiten/Components mit
`@inherits PizzaComponentBase`. Das ist sogar Blazor-idiomatisch
(entspricht dort einer gemeinsamen Basisklasse).

**Offene Frage fürs Framework:** Sollte `collectCodeImports` auch freie
Funktionen aus `.ts`-Dateien erkennen und `knownGlobals` füttern? Aktuell
scannt es nur PascalCase-Identifier (Typen/Components).

**Stand A3 (2026-09-30):** beantwortet durch explizite Imports — die Helfer (und
`PIZZA_MINIMUM_SIZE`/`PIZZA_MAXIMUM_SIZE`) stehen als `@import` in der `_Imports.tsazor`
der App, `PizzaComponentBase` ist entfernt.

**Stand A4 (2026-09-30):** Abschnitt obsolet. `bakeMemberRefs` ist durch Rewriting über den
TS-AST mit Scope-Analyse ersetzt (`packages/compiler/src/rewrite.ts`); Imports, Locals und
JS-/DOM-Globals (aus TypeScripts `lib.d.ts`) bleiben frei, deklarierte Member werden `this.X`.
Weder Basisklassen- noch Free-Function-Workaround ist nötig.

## D. Dokumentierte Abweichungen vom Original

| Original | Tsazor-Port | Begründung |
|---|---|---|
| ASP.NET Core Server + EF/SQLite | `server/server.mjs` (node:http, zero deps, in-memory) | Port-Test-Case; REST-Vertrag 1:1 |
| ASP.NET Identity + OIDC (RemoteAuthenticator) | Cookie-Session-Auth: `POST /auth/register\|login\|logout`, `GET /auth/user` | OIDC wäre eigenes Projekt; AuthProvider-Integration ist das Testziel |
| `GET /auth/user` anonymous → 401 | → `200 { user: null }` | Hält die Browser-Console beim App-Start fehlerfrei (E2E-Gate: null Console-Errors) |
| DataAnnotations (`[Required]`, `[MaxLength]`) | Funktionale `ModelValidator`-Map im `@code`-Block | Keine Reflection in TS; siehe `Checkout.tsazor` |
| BootstrapFieldClassProvider | 2–3 CSS-Regeln in `wwwroot/css/site.css`, die Tsazors `invalid`/`modified valid`-Klassen auf Bootstrap-Farben mappen | Kein Provider-Konzept nötig |
| ComponentsLibrary Map (JS-Interop + Leaflet) | `Map.tsazor` importiert Leaflet **direkt** via npm (`await import("leaflet")`) | Tsazor IST JS — kein Interop nötig; der größte Einzelgewinn des Ports |
| Push-Notifications (VAPID/Service-Worker) | **skip** (PUT/GET /notifications-Vertrag wird honored, Subscription nur in Memory) | Eigenes Projekt; kein Testwert fürs Framework |
| GraphQL Special Offers (Workshop-Modul 6) | **skip** | Ebenfalls eigenes Projekt |
| LocalStorage/Geolocation via JS-Interop | Direkter `window.*`-Zugriff im `@code`-Block | dito |

## E. Was reibungslos funktionierte (Blazor-Parität bestätigt)

- `@page` + Router + `NavLink` + Layouts + `@layout`
- `AuthorizeRouteView` / `AuthorizeView` / `AuthenticationStateProvider`
  (Provider unter zwei DI-Tokens registriert: konkrete Klasse + Basisklasse)
- `EditForm` + `Validators` + `ValidationMessage For="name"` (per-Field on submit)
- `EventCallback` (Child → Parent, receiver re-rendert nach invoke — Poller/Dialog-Flow)
- Cascading `OrderState`-Service via DI (Zustandsänderung → Re-Render der Konsumenten)
- Route-Parameter mit Constraint (`@page "/myorders/{orderId:int}"` → `@Parameter() orderId!: number;`)
- Dynamischer npm-Import in `.tsazor` (`await import("leaflet")` + CSS-Import)

## F. Verifikation

- `apps/blazing-pizza`: `node --test test/` (Status-Engine, 5 Tests) +
  `node scripts/verify-pizza.mjs` (19 E2E-Checks, headless Edge, null Console-Errors)
- Framework-Regressionen: alle Package-Tests bleiben grün (compiler, runtime,
  workspace, testing, lsp, vite-plugin, components)

---

# Dogfooding: Tutorial-App (`apps/tutorial`, M1) → Tsazor

Die interaktive Tutorial-Shell (Topbar, Lektionsmenü, Text, Datei-Tabs, CodeMirror-Editor,
Problems-Panel, Preview-Iframe) ist komplett in `.tsazor` geschrieben; dazu läuft die
Compiler-Pipeline **im Browser** (Web Worker). Befunde:

## G. Framework-Lücken (im Paket minimal geschlossen)

### 1. Scoped-CSS-Selektorlogik hing an postcss + `node:crypto` — **verschoben**

`scopeSelector` war reine String-Logik, lag aber in `packages/vite-plugin/src/scoped-css.ts`
neben postcss und `createHash`. Ein Browser-Host konnte sie nicht importieren.
**Fix:** nach `packages/compiler/src/scoped-css.ts` verschoben und aus `@tsazor/compiler`
exportiert; das Vite-Plugin importiert und re-exportiert sie (Tests unverändert grün). Den
Stylesheet-Walk (Regeln, `@media`, `@keyframes`) macht im Browser ein kleiner eigener Walker
(`apps/tutorial/src/engine/scoped-css.ts`) — postcss bleibt Plugin-only.

### 2. `@tsazor/workspace` ist nur über `node:fs` nutzbar — **Teil-Fix, Rest offen**

Die Built-in-Listen (`RUNTIME_COMPONENTS`, `RUNTIME_TYPES`, `RUNTIME_MANIFEST`) sind reine
Daten, kamen aber nur über den Index, der `node:fs`/`node:path` zieht. **Teil-Fix:** neuer
Subpath-Export `@tsazor/workspace/builtins` (Node-frei; `RUNTIME_MANIFEST` dort re-exportiert).
**Offen:** die eigentliche Auflösung (Enclosing-Folders, `@using`-Quellen, Ambiguität,
`_Imports`-Kette, Metadata-Host) ist an das Dateisystem gebunden; das Tutorial dupliziert
die Regeln in-memory (`apps/tutorial/src/engine/resolve.ts`, ~250 Zeilen). Vorschlag: ein
`FileSystemHost`-Interface (`exists`, `read`, `list`) in `createFileContext`/`MetadataCache`,
Node-Implementierung als Default — dann teilen Plugin, LSP und Browser-Hosts *eine*
Auflösung (Playground, Tutorial, später ein REPL).

## H. Reibungen (dokumentiert, kein Fix nötig)

### 3. `@if`-Narrowing erreicht deferred ChildContent nicht

```razor
@if (current && text) {
    <PageTitle>@text.title</PageTitle>   @* tsazor check: TS2532 'possibly undefined' *@
}
```

Der Body von `<PageTitle>` ist ein `RenderFragment` (Lambda, später gerendert) — TS verwirft
das Narrowing von `this.text` darin, korrekt nach TS-Semantik (C#/Razor-Nullable-Analyse
verhält sich in Lambdas ähnlich). Überraschend für Lernende; Workaround: Getter
(`pageTitle`) oder ein Local per `@{ const t = text; }` vor dem Tag. Kandidat für einen
Hinweis in der Sprachreferenz bzw. später im Tutorial (Kapitel „Reusing content").

### 4. `tsazor check` ohne Pfad prüft auch Beispiel-Projekte im App-Ordner

`tsazor check` (Root = App) fand die Lektions-Dateien unter `content/` und meldete TZS005
(`<Nested>` in `app-b/` liegt nur in `app-a/`). Es gibt kein Exclude; Workaround
`tsazor check src`. Vorschlag: `check` respektiert `tsconfig.include`/`exclude` oder ein
`--exclude`-Glob.

### 5. Imperative Widgets einbetten: gut, mit einer Regel

CodeMirror und der Preview-Iframe hängen per `@ref` + `onAfterRender(firstRender)` +
`dispose()` sauber am Komponenten-Lifecycle (Blazor-Muster mit JS-Interop, hier ohne
Interop). Callbacks aus Nicht-Tsazor-Events (postMessage, Editor-Updates) brauchen
`this.stateHasChanged()` bzw. ein `EventCallback.invokeAsync` — wie Blazors
`InvokeAsync(StateHasChanged)`. Funktionierte ohne Workaround.

### 6. Komponenten-Typ für `@ref` braucht ein explizites `@import`

`<CodeEditor @ref="editor" />` löst über `@using ./Shell` auf, das Feld
`private editor?: CodeEditor;` braucht für den *Typ* trotzdem
`@import CodeEditor from "../Shell/CodeEditor.tsazor"` (Tag-Auflösung ≠ Name im Code — so
dokumentiert, aber eine Stolperstelle). Der Shadow könnte ein `@ref`-Feld ohne Annotation
mit dem aufgelösten Tag-Typ versehen.

### 7. Ausblick (in M1 nicht getroffen, für M3 notiert)

Die Preview läuft als `srcdoc`-Iframe mit opakem Origin (`sandbox="allow-scripts"`). Für die
Routing-Lektionen (`@page`, `NavLink`, `navigateTo`) wird `history.pushState` dort
voraussichtlich scheitern (about:srcdoc). Option: NavigationManager mit In-Memory-History
(der Konstruktor nimmt schon ein `historyApi`) — für Previews/Tests generell nützlich.

## I. Was reibungslos funktionierte

- Der Compiler läuft unverändert im Browser (Worker): nur `typescript` + `@jridgewell/*`,
  keine Node-APIs — `compile()` + `extractTsazorMetadata` + `resolveComponentMetadata` mit
  einem eigenen `MetadataHost` reichen für Parameter-Metadaten, TZS025 & Co.
- `typescript.transpileModule` statt esbuild senkt die Standard-Decorators korrekt;
  der `Symbol.metadata`-Polyfill der Runtime greift.
- Quellmaps: Compiler-Map + TS-Map verkettet ⇒ Laufzeitfehler in der Preview zeigen
  `App.tsazor:5:9` (E2E geprüft).
- Router mit Route-Parametern (`@page "/{track}/{slug}"`), `PageTitle`, Scoped CSS +
  `::deep` für Fremd-DOM (CodeMirror, Iframes, Markdown-HTML), `MarkupString` für den
  Lektionstext, DI-Singleton für den Tutorial-State.