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
---

# Dogfooding: Tutorial M2 (Part 1, Kapitel 2–7) → Tsazor

Die 27 neuen Lektionen (State, Parameter, Logik, Events, Bindings, Styles) haben jede
Behauptung des Lektionstexts als Test gegen Compiler, Runtime und Typ-Check festgenagelt
(`apps/tutorial/test/claims-part1.test.ts`). Dabei fielen auf:

## J. Framework-Lücken (behoben, mit Tests)

### 1. `ComponentBase`-Buchhaltung kollidierte mit Komponentenfeldern — **behoben**

`ComponentBase` hielt seinen Lifecycle-Zustand in TS-`private`-Feldern (`initialized`,
`hasPendingRender`, `firstRenderDone`, …). TS-`private` ist nur Compile-Zeit: ein
Komponentenfeld `initialized = "no"` überschrieb das Flag, `setParametersAsync` hielt die
Komponente für initialisiert und **rief `onInitialized` nie auf** (der Typ-Check meldet
TS2415, der Build nicht). In Blazor kollidieren private Basisfelder nie. **Fix:** echte
`#private`-Felder/Methoden in `component-base.ts` (nur dort benutzt). Test:
`runtime/test/lifecycle.test.ts` („ComponentBase's own state is invisible“). Rest-Risiko:
`renderHandle`/`componentServices` bleiben öffentliche (`@internal`) Namen.

### 2. `@onclick="() => count++"` scheiterte am Typ-Check — **behoben**

`EventCallback.bind` verlangte `(arg) => void | Promise<void>`. Die TS-Regel „jeder
Rückgabetyp ist `void`-kompatibel“ gilt nur für reines `void`, nicht für die Union — jede
Lambda mit Wert (`() => count++`, `() => show = !show`, Blazors Standardbeispiel) war
TS2345 in `tsazor check`/LSP. **Fix:** Delegate-Typ `(arg) => unknown` (Laufzeit wartet
ohnehin nur auf echte Promises). Gepinnt in `claims-part1` („inline-handlers“).

### 3. `@attributes` mit nicht gesetztem Capture-Parameter — **behoben**

`addMultipleAttributes(seq, undefined)` warf zur Laufzeit (`Object.keys(undefined)`) —
also jede Komponente mit `captureUnmatchedValues`, der der Parent *keine* Extra-Attribute
gibt. Der Typ verlangte zudem `Record<string, AttributeValue>`, so dass das übliche
`attributes?: Record<string, unknown>` TS2345 war. **Fix:** Blazor-Semantik (null/undefined
fügt nichts hinzu), Parametertyp `Readonly<Record<string, unknown>> | null | undefined`.
Test: `runtime/test/render-tree.test.ts`.

### 4. `@bind` auf `type="range"` lieferte Strings — **behoben**

Die `Number()`-Konvertierung hing nur an `type="number"`; ein Range-Slider schrieb `"5"`
in ein `number`-Feld (`a + b` ⇒ `"52"`). Blazor hat `BindInputElement("range", …)`.
**Fix:** `range` wie `number` (inkl. `@bind:format`). Test: `compiler/test/codegen.test.ts`.

### 5. `@bind` auf `type="date"` ohne Format zeigte nichts — **behoben**

Die Anzeige band das `Date`-Objekt roh (`String(date)` ⇒ für ein Date-Input ungültig ⇒
leeres Feld), die Rückrichtung parste mit `new Date(text)` (UTC-Mitternacht). Blazor nimmt
für Date-Inputs das Default-Format `yyyy-MM-dd`. **Fix:** Default-Format `yyyy-MM-dd`
(formatValue/parseValue, lokales Datum), ein explizites `@bind:format` ersetzt es.

### 6. Leerer Number-Input setzte 0 — **behoben**

Der NaN-Guard ließ `Number("") === 0` durch; ein Number-Input meldet ungültigen Text als
`""`, also wurde Löschen/Tippfehler zu `0`. Blazor (`TryParse("")` schlägt fehl) und der
Format-Pfad (`parseValue`) behalten den alten Wert. **Fix:** leerer Text behält den Wert.

## K. Lücken (dokumentiert, nicht behoben)

### 7. `@bind:format` auf Text-Inputs (Blazors Datums-Idiom) — **offen**

`<input @bind="date" @bind:format="dd.MM.yyyy" />` ist in Blazor das Standardbeispiel. Der
Compiler entscheidet Konvertierung/Format am Element (`type`), nicht am Feldtyp, und
behandelt das als String-Bind (TZS008-Warnung, Format wirkungslos). Machbar wäre ein
Laufzeit-Dispatch über den aktuellen Modellwert (`Date`/`number` ⇒ formatValue/parseValue),
das ist aber mehr als ein Mini-Fix. Lektion „Formatted bindings“ zeigt `type="number"` +
`F2` und den Date-Default und dokumentiert die Abweichung (Blazor-Track);
`language-reference.md` ergänzt.

### 8. Select/Number-Felder: kein Konvertieren nach Feldtyp

Wie 7: `@bind` auf `<select>` schreibt immer den String. Blazor konvertiert nach `int`/Enum.
`tsazor check` meldet die Zuweisung an ein `number`-Feld (TS2322) — die Lektion nutzt
String-IDs und erklärt das.

### 9. Event-Argument-Typ wird nicht gegen den Eventnamen geprüft

`@onpointermove="move"` mit `move(e: KeyboardEvent)` ist im Typ-Check grün; Blazor würde
`EventCallback<KeyboardEventArgs>` vs. `MouseEventArgs` ablehnen. Vorschlag: im typisierten
Shadow den Handler gegen `HTMLElementEventMap[name]` prüfen. Lektion „DOM events“ sagt es
ehrlich („the annotation is your promise“).

### 10. TS1360-Squiggle sitzt hinter dem Attributwert (auch im LSP)

Der Shadow prüft Komponentenattribute als `(value) satisfies T`; TS meldet TS1360 am
*Typ*-Knoten, der keine Quelle hat — `genToSrc` rechnet vom letzten Token aus weiter und
landet hinter dem Wert. Das Tutorial mappt den Fehler auf Attributstart…Wertende um
(`apps/tutorial/src/engine/type-check.ts`, `satisfiedValueSpan`). Das LSP (`tsDiagnostics`)
hat dieselbe Verschiebung — Kandidat für denselben Fix dort oder ein Mapping-Eintrag für
den `satisfies`-Typ im Codegen.

### 11. happy-dom 18: `nextSibling` von `<select>`/`<form>` ist `undefined`

`select.nextSibling`/`form.nextSibling` liefern in happy-dom 18 `undefined`, obwohl
`childNodes` stimmt. Der DomRenderer läuft Geschwister per `nextSibling` ab ⇒ DOM-Updates
von Elementen *nach* einem Select/Form scheitern in `@tsazor/testing` („Cannot read
properties of null“), im Browser nicht (E2E prüft den Select-Bind in Edge). Betrifft
Nutzertests mit `@tsazor/testing`. Optionen: happy-dom-Update prüfen, oder `LogicalChildren`
über `childNodes` statt `nextSibling` laufen lassen (nur für Tests nötig — nicht gemacht).

## L. Engine-Ergänzungen fürs Tutorial

- **In-Browser-`tsazor check`:** `src/engine/type-check.ts` baut die Shadow-Module wie das
  LSP (`compile(…, { typedShadow })`, Rewrite A für Geschwister-Komponenten), dazu ein
  TS-LanguageService über ein In-Memory-FS (lib-.d.ts + `@tsazor/runtime`/`components`-d.ts,
  `virtual:tutorial-types`, lazy im Worker). Mapping über `TsazorGenMap` — dafür neuer
  Subpath-Export `@tsazor/lsp/ts-mapping` (node-frei). Der Worker antwortet zweistufig
  (Build ⇒ Preview sofort, Typ-Diagnosen danach); Typfehler stoppen die Preview nicht. Der
  Lesson-Gate prüft jetzt jede `app-a`/`app-b` auch typ-sauber (`typeErrors: true` für die
  Lektion, die davon handelt). Wiederkehrender Wunsch aus G.2: ein `FileSystemHost` in
  `@tsazor/lsp`/`workspace`, dann entfiele die Duplizierung von Shadow-Bau und Auflösung.
- **Highlighting:** der `.tsazor`-Stream-Mode behandelt Control-Block-Bodies und `@{ }` als
  Code (Statements, Markup ab Tag in Statement-Position bis zum schließenden Tag, `@:`-Zeilen,
  `else`/`catch`/`finally`-Fortsetzungen); Generics in `@code` sind keine Tags mehr.
- **Gate mit Interaktion:** Front-Matter `gate: click …; wait …` für Lektionen, deren Lösung
  sich erst im Verhalten unterscheidet; Formular-Zustand (value/checked) zählt zum Snapshot.
- **verify.mjs** nutzt einen Server auf :5330 nur, wenn er diesen Checkout bedient
  (`/__tutorial-root`), sonst startet es einen eigenen auf dem nächsten freien Port
  (parallele Worktrees).

# Umsetzung `@Bindable` + `this.observe` (design-bindable-observe.md)

## M. Framework-Lücken, gefunden beim Umsetzen

### 1. Neue `ComponentBase`-Member kollidieren mit Komponenten-Membern — **umgangen, offen als Regel**

Die Methode hieß zuerst `track()` und brach das Tutorial: `Lesson`/`TopBar`/`LessonMenu`/`LessonText`
hatten einen Parameter `track` (die Lern-Spur „ts“/„blazor“) ⇒ TS2416 im Check, zur Laufzeit
hätte der Parameter die Methode überschrieben. Der Parameter wurde in `lessonTrack` umbenannt (Route-Platzhalter
`/{lessonTrack}/{slug}`, URLs unverändert), danach die API selbst in `observe()` (Entscheidung des
Users: `track` ist ein häufiges Fachwort, die Kollision wäre in Ports wiedergekommen). Allgemein: Blazors `ComponentBase` hat PascalCase-
Member, die mit camelCase-Feldern nie kollidieren — Tsazors camelCase-API teilt sich den
Namensraum mit den Nutzerfeldern. Jede neue öffentliche/protected Methode auf `ComponentBase`
(`observe`, `disposeSignal`, künftig mehr) ist ein potenzieller Bruch für Ports. Der Check meldet
es (TS2416), aber ohne Erklärung. Vorschlag: eine Liste reservierter Namen + eigene Diagnose mit
Umbenennungs-Fix, und neue Base-Member sparsam (Entscheidung „Methode statt freier Funktion“ in
der Design-Tabelle hat diesen Preis).

### 2. `@bind-X`-Werte wurden nicht typgeprüft — **behoben**

Der Shadow prüfte Komponenten-Attribute per `satisfies`, aber nicht den Wert eines
Komponenten-Binds (`@bind-Value="x"`, `:get`). Jetzt gleich behandelt (Paar wie `@Bindable`);
alle Apps blieben sauber.

### 3. Async-Handshake und `waitUntilIdle` — **Entscheidung**

Ein `observe` auf eine Quelle, deren `subscribe` ein nie auflösendes Promise liefert, ließ
`waitUntilIdle` (und damit `render()` in `@tsazor/testing`) hängen, solange der Handshake
mitgezählt wurde. Jetzt nicht mitgezählt: eine Subscription ist offen, sie darf Idle-Erkennung
(und künftiges Prerendering, roadmap-ssr) nicht blockieren. Tests, die den Handshake abwarten
wollen, warten auf die Quelle selbst.

### 4. Synthetisierte Member sind in `.ts`-Klassen nicht typisiert — **Grenze**

Ein Decorator kann den Klassentyp nicht erweitern. In `.tsazor` deklariert der Compiler
`declare valueChanged?: EventCallback<T>` selbst; eine Code-behind-/`.ts`-Klasse, die
`this.valueChanged` benutzt, muss die Zeile selbst schreiben (die Metadaten/`@bind` brauchen
sie nicht). Bei nicht-literalem Initializer ohne Annotation ist `T` `unknown` (wie TZS026 bei
`@Parameter`).

### 5. Bundle

Bench-Bundle (`apps/bench/tsazor`): 87,38 kB / **24,79 KB gz** vor ⇒ 88,70 kB / **25,28 KB gz**
nach (+0,49 KB gz; `observe`/`disposeSignal`/`disposeInternal` sind `ComponentBase`-Methoden und
damit nicht tree-shakebar; `@Bindable` selbst fällt raus, wenn ungenutzt; die Dev-Warnungen
entfernt Vite über `import.meta.env.DEV`). Die 20,4 KB aus der Roadmap sind ein älterer Stand —
die Ausgangsbasis dieses Branches war bereits 24,79.
