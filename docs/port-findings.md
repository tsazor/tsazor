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

### 3. Async-Lifecycle-Hooks rendern nicht nach dem `await` — **Workaround nötig**

`onInitialized`/`onParametersSet` laufen innerhalb des Render-Passes. Ein
`await` + Feldzuweisung danach triggert **kein** Re-Render — die Seite bleibt
im Loading-State (Blazor verhält sich identisch, das Original ruft dort
explizit `StateHasChanged` auf). Tsazor verhält sich also korrekt
Blazor-ähnlich, aber der Port zeigte, dass jede async-ladende Page das
braucht — drei Pages/Components hatten den Bug latent (sie rendernten nur
zufällig korrekt, weil ein Auth-Probe-Re-Render hinterherkam).

**Workaround (in der App):** Nach dem `await` in `onInitialized`/`onParametersSet`
explizit `this.stateHasChanged()` aufrufen — exakt wie im Blazor-Original.
**Offene Frage fürs Framework:** Sollte Tsazor hier komfortabler sein als
Blazor (z. B. async Lifecycle-Hooks automatisch nach-awaiten und re-rendern)?
Blazor-Kompatibilität sagt nein, DX sagt ja. Entscheidung offen.

## B. Syntax-Regeln, die der Port bestätigt hat (Fallerinnerung, kein Fix nötig)

| Thema | Regel |
|---|---|
| Component-Event-Attrs | Proven form: `OnSelect="@(() => fn())"`. `@() => ...` **ohne** äußere Klammern ist kaputt (parses als expliziter Ausdruck + Text). |
| Element-Handler | Kleinschreibung `@onclick="handlerName"` (bare Name) oder `@onclick="@(() => ...)"`. PascalCase-Element-Attrs funktionieren ebenfalls. |
| `@foreach` | Razor-Syntax `@foreach (var x in y)` → `for (const x of ...)`. `@foreach (const x of y)` löst den TZS001-Fallback aus (funktioniert versehentlich, aber falsch). |
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