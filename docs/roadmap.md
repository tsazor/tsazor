# Roadmap — Behebung der Review-Befunde

Grundlage: [review-2026-09-30.md](review-2026-09-30.md). IDs (C…, R…, T…, I…) verweisen dorthin.

**Ordnungsprinzip:** Reihenfolge nach technischen Abhängigkeiten, nicht nach Aufwand.
Ein Schritt kommt erst, wenn das, worauf er aufbaut, korrekt ist — sonst wird er zweimal
gebaut. Quick Wins werden deshalb nicht vorgezogen, sondern dort erledigt, wo sie im neuen
Code ohnehin entstehen (viele verschwinden durch den Umbau von selbst).

## Stand vor Phase 2 (2026-09-30)

**Erledigt:** Phase 0, Track A (A1–A6), Track B (B1–B7), dazu nachgezogen: SVG-Namespace,
`captureUnmatchedValues` pro Parametersatz, Event-Handler-Render nach dem synchronen Teil
(`HandleEventAsync`), Booleans/`bigint` als Text, `<input type=time|datetime-local>`-Sekunden.
Alles auf `roadmap/phase-0`, nicht gepusht, `main` unverändert.

**Gates auf dem Gesamtstand (nach A6):** 773/773 Tests (Konformitätssuite: alle Compiler-Befunde außer
C12/C13 und alle Runtime-Befunde grün), LSP-Smokes, Pizza 20/20, Gallery, Sleipnir, Demo
(components 31, scoped 10, code-behind 5, debugging 14, counter-state 8).

**FluentCMS-Probe:** 13 → 145 (A2) → 178 (A5) → seit A6 **160/217** sauber bzw. **178/217 nach den Codemod-Formen** (TZS021: 35 × `foreach … in`, 1 × `[CascadingTypeParameter]`); echte Fehler: 1 Datei. Rest:
`@context` ×18 und 36 unaufgelöste Tags (Slots — Phase 2.3; `DynamicComponent`,
`HeadContent`, `InputFile`, `ErrorBoundary`, `DataAnnotationsValidator` — Phase 3), 12 × C#
`$"…"` als unquoted Attributwert (kein TS-Gegenstück).

**Benchmark A/B** (ruhiger Rechner, abwechselnd je 2 × 10 Läufe, `0abdc98` → jetzt): ready
66–75 → 73–78 ms (keine Ausreißer; die ~940-ms-Werte der Agent-Läufe waren Rechnerlast),
append1k 118 → 74, upd10th 110 → 62, swap 191 → 142, select 66 → 17, remove 343 → 305 ms,
heap 16,5 → 15,7 MB. **Bundle 14,1 → 22,7 KB gz (+61 %)**, nach A6b (Standard-Decorators + `sideEffects` im Runtime-Paket) **20,4 KB gz** — vor Phase 5 weiter prüfen
(Kandidaten: Router/Navigation-Rewrite, DOM-Journal, Error-/Batch-Code, generierte Helfer).

**Bewusste Abweichungen von Blazor** (dokumentiert, getestet): Render-Queue parent-first
(Blazor: FIFO); `onAfterRender` Kinder zuerst, einmal pro Batch (Blazor: Render-Reihenfolge);
DOM-Anwendung pro Pass + Journal-Rollback (Blazor: pro Batch); ohne `<base>` ist die Basis die
Origin-Root; `regex(...)`-Constraints immer verankert; `Date` gilt als veränderlich (B6).

**Gesammelte offene Punkte** (nicht blockierend für Phase 2, Zuordnung in Klammern):
- `ValueExpression` nur, wenn die Zielkomponente es deklariert; `/^on/i`-EventCallback-Heuristik
  entfernen (2.2 / Sync-Punkt B8).
- `@inherits`-Basis-Member mit DOM-Global-Namen (`length`, `top`) bleiben global (2.1/2.4).
- ~~`@bind-value` (klein) auf *Elementen* wird als Komponenten-Bind emittiert; `@bind` auf eine
  `@foreach`-Variable scheitert erst zur Laufzeit (C#: CS1656)~~ — **erledigt (A7)**.
- ~~Syntaxfehler in Markup-Ausdrücken ohne eigene TZS-Diagnose~~ — **erledigt (A7, TZS024)**;
  `var` in Statement-Runs bleibt `var` — seit A6a mit Warnung TZS022 (TS-Semantik), seit A7 mit
  Fix `let`.
- Code-behind-/`_Imports`-Änderungen invalidieren abhängige Module nicht (4.1).
- ~~`NavLink` vergleicht base-relative statt absolute URIs~~ — **erledigt (A7)**.
- EditForm `OnInvalidSubmit` / awaited `OnValidSubmit` (3.5).

**Stand A7 (Nachträge vor Phase 2, Branch `roadmap/a7-followups`):**
- *Diagnose-Bereiche:* jede `TszDiagnostic` hat `endPos` (exklusiv) neben `pos` (Start, unverändert
  Bedeutung „Anfang") — `@foreach (…)`-Kopf, Direktive, Attribut (gefaltete `@bind`-Modifier mit
  eigenem Bereich), Tag-Name, Fehler-Token, Öffner offener Blöcke. Einzige Positions-Änderung:
  TZS021 für `@foreach` beginnt jetzt am `@` (vorher am Kopf-Code). Mechanische Fixes als
  `fix: { title, edits: [{ pos, endPos, text }] }`: TZS021 (`foreach … in`, `where T : X`,
  einzelnes literales `[Authorize]`/`[Route]`/`[AllowAnonymous]`), TZS022 (`var` ⇒ `let`). Der LSP
  veröffentlicht die Bereiche und bietet die Fixes als Quick-Fix-Code-Actions an.
- *`@bind-<attr>` auf Elementen* bindet das Attribut (Razor), Komponenten-`@bind-Value` unverändert.
- *`@bind` auf Schleifenvariable* (`for…of`/`for…in`, auch `let`), `const`-Local,
  `function`/`class`/`enum` oder Import ⇒ TZS008 zur Compile-Zeit.
- *TZS024* für Syntaxfehler in Markup-Ausdrücken (erster TS-Parser-Fehler, auf seinem Token);
  ungültiger `@for`-Zählkopf ⇒ TZS015. `transformTsazor` lässt die TZS-Diagnosen vor dem
  esbuild-Folgefehler gewinnen.
- *NavLink* nach Blazor .NET 8 (`ShouldMatch` über absolute URIs). Folge: ein `Prefix`-Link auf
  die Basis ist überall aktiv — Home-Links in Demo, Sleipnir und Gallery-Sidebar nehmen
  `NavLinkMatch.All` (wie Blazor-Templates; `SidebarNav`-Links haben optional `match`).
  Nebenbei: `href=""` war ein leerer Ausdruck (`undefined`), jetzt der leere String.
- *FluentCMS-Probe:* 160 → **149/217** sauber, 178 → **164/217** nach Codemod-Formen, Dateien mit
  echten Fehlern 1 → 25 — TZS024 ×34 macht bisher stille C#-Reste sichtbar (esbuild wäre daran
  gescheitert): `(MarkupString)x`-Casts ×9, `$"…"` in `@(…)`/Attributen ×10, anonyme Objekte
  `new { id = … }` ×10, `is (not) null` ×2, `out var` ×1, `File.Exists($"…")` ×1, `default` ×1 —
  Kandidaten für Codemod (2.5) bzw. Phase-3-Built-ins (`MarkupString`).

## Abhängigkeitsgraph

```
Phase 0  Fundament (Build, ESM, Konformitätstests)
   │
   ├──────────────────────────────┐
   ▼                              ▼
Track A: Compiler               Track B: Runtime
A1 Writer + Sourcemaps          B1 Diff als reine Edit-Liste
A2 Code-first-Parser            B2 Render-Queue + Batches
A3 Import-Modell                B3 DOM-Applier mit Logical Ranges
A4 TS-AST-Rewriting             B4 Lifecycle-Semantik
A5 Direktiven-/Bind-Semantik    B5 Cascading-Subscriptions
   │                            B6 Change-Detection
   ▼                            B7 Router/Navigation (unabhängig)
Phase 2  Typ-Metadaten              │
2.1 Parameter-Metadaten             │
2.2 Metadaten-gestützte Codegen ────┤  (Sync: EventCallback explizit → B8)
2.3 Templated Components            │
2.4 Typed Shadows + tsazor check    │
2.5 LSP projektweit                 │
   │                                │
   └──────────────┬─────────────────┘
                  ▼
Phase 3  Parität: Built-ins & Formulare (braucht A+B+2)
                  ▼
Phase 4  Dev-Server (HMR/Invalidierung) · Fluent-Überarbeitung
                  ▼
Phase 5  Paketierung für externe Nutzer · .NET-Bridge-Paket
```

Track A und Track B sind **parallel bearbeitbar**: Die einzige Schnittstelle ist die
`RenderTreeBuilder`-API, die stabil bleibt. Synchronisationspunkte sind explizit markiert.

---

## Phase 0 — Fundament

Ohne verlässliche Tests sind die Umbauten in A und B nicht absicherbar.

**Stand: Phase 0 abgeschlossen** (Branch `roadmap/phase-0`).

- 0.1/0.2: Dabei zusätzlich behoben: `.tsbuildinfo` von `runtime` lag außerhalb von `dist`
  (Clean-Build lieferte leeres `dist`); Pizza-E2E (Klick verfehlte Button durch Layout-Shift
  der Live-Validierung seit `fa680e2`; Poller-Request-Sturm, siehe Review C12-Nachtrag; OSM-
  Kachel-Check wartete fest 1 s) und Sleipnir-E2E (las Platzhalter vor den Daten) — alle
  bestanden schon vor Phase 0.
- 0.3/0.4: `packages/conformance` — 113 Tests (17 grün als Regressionsschutz, 96 `it.fails`,
  je verifiziert, dass sie aus dem genannten Grund scheitern). Läuft gegen die Paket-Quellen
  im Root-`pnpm test`. Compiler-Tests prüfen gerendertes DOM + Diagnostics über die echte
  Plugin-Pipeline (`transformTsazor`, aus dem Plugin extrahiert), nie generierten Code.
  Korrektur ans Review: generisches `@inherits` funktioniert in der echten Pipeline.
- 0.5: `node scripts/probe-razor-corpus.mjs` (braucht `compiler/dist`; Korpus-Cache in
  `.probe/`, gitignored). **Baseline FluentCMS@c63d49c: 13/217 sauber**, 171 ohne Fehler
  (davon 155 mit erkannten stillen Fehlern), 46 mit Fehlern, 36 mit unaufgelösten Tags.
  **Verlauf:** nach A1+B1 unverändert 13 · nach A2+B2 **145/217** sauber (182 ohne Fehler, 19 mit
  stillen Fehlern — `@context` ×18, Modifier-Wert ×1; 35 mit Fehlern — v. a. TZS008 `@bind` `!.` ×139 → A5)
  · nach A3 unverändert 145/217 (die Probe kompiliert ohne Workspace-Auflösung)
  · nach A4 unverändert 145/217 (verbleibende Befunde: `@bind`-`!.`, `@context`/Slots → A5/Phase 2)
  · nach A5 **178/217** sauber (216 ohne Fehler; 1 Datei mit Fehlern — TZS009 ×12, C#-`$"…"` als
  unquoted Attributwert; stille Befunde nur noch `@context` ×18; unaufgelöste Tags ×36 → Phase 2)
  · nach A6a **160/217** sauber, **178/217 nach Codemod-Formen** (C#-Formen TZS021 werden
  getrennt gezählt: 33 Dateien — `@foreach (var … in …)` ×35, `@attribute [CascadingTypeParameter]`
  ×1; echte Fehler unverändert 1 Datei; TZS022 `var` ×4).

| Schritt | Inhalt | Warum hier |
|---|---|---|
| 0.1 | `pnpm install` / `node_modules` reparieren; `packages/vscode` Workspace-Deps (`@tsazor/lsp`, `@tsazor/workspace`) deklarieren, sodass sauberes `pnpm -r build` durchläuft | Alles Weitere braucht grüne Gates |
| 0.2 | ESM-Ausgabe Node-ladbar machen: `module: NodeNext` + `.js`-Endungen (oder Bundling pro Paket); fehlende Deps (`@jridgewell/gen-mapping` im compiler) | `tsazor check`-CLI (2.4), Test-Skripte und `@tsazor/testing` laufen in Node — nicht erst beim Publishing relevant |
| 0.3 | **Compiler-Golden-Tests:** alle Repros aus §1 des Reviews als Snapshot-Tests (Eingabe → erwartete Ausgabe bzw. Diagnostic), zunächst als `it.fails` markiert | Zielbild des Umbaus A; jeder Fix kippt einen Test von „fails" auf grün |
| 0.4 | **Runtime-Konformitätssuite:** Blazor-Semantik festschreiben — Lifecycle-Reihenfolge, Loading-Render bei async `onInitialized`, `OnAfterRender` nach Batch, `@key`-Neuanlage, Duplicate-Key-Fehler, Disposal verschachtelter Komponenten, Moves, `ShouldRender` beim ersten Render, Parent-first. Repros R1–R15, als `it.fails` | Zielbild von Track B; ohne sie ist „Blazor 1:1" nicht überprüfbar |
| 0.5 | **FluentCMS-Probe als Messskript** ins Repo (`scripts/probe-razor-corpus.mjs`): klont Upstream, kompiliert alle `.razor`, zählt Diagnostics und stille Fehler. Upstream wird nicht eingecheckt | Fortschrittsmetrik über alle Phasen |

**Gate:** Build grün, alle bestehenden Tests grün, neue Suiten laufen (erwartet rot).

---

## Track A — Compiler

Die LSP-Shadow-Module sind `compile()`-Output + Sourcemap (`lsp/src/shadow-module.ts`).
Jede Verbesserung hier verbessert damit automatisch auch Diagnostics im Editor — und
umgekehrt ist Phase 2 ohne korrekten Compiler und korrekte Sourcemaps nicht sinnvoll.

### A1 — Zeilenbewusster Code-Writer und Sourcemaps

Writer, der eingebettete Zeilenumbrüche zählt und pro Token mappt; `sourcesContent`
befüllen; Tab-Spalten korrekt. Behebt C10 und die Spaltenfehler.

*Warum zuerst:* Kleinster, isolierter Schritt; alle späteren Schritte emittieren über den
Writer, und falsche Maps würden jede spätere Fehlersuche (auch im LSP) verfälschen.
**Stand: A1 umgesetzt** (gemergt in `roadmap/phase-0`). `CodeWriter` (writer.ts) ist die einzige
Stelle, die generierten Code + Mappings schreibt; Anker werden über eingebettete Zeilenumbrüche
aufgelöst. Token-genaue Mappings auch auf Folgezeilen, exakte `@code`-Spalten (Tabs bleiben
erhalten), `sourcesContent` bis durch die Plugin-Kette. Nebenbei behoben: `@(x)` eine Spalte
zu früh, `on*`-Werte auf Komponenten um die Wrapper-Länge versetzt. Konformität: alle 4
Sourcemap-Tests grün. **Offen für A2:** mehrzeilige Control-Header (`@if (a &&
 b)`) haben
keine Quellposition im AST — ihre Folgezeilen bleiben ungemappt.

### A2 — Code-first-Parser

Razor-Modell übernehmen: In Code-Kontexten (`@{}`, Control-Bodies, `@code`) wird TS
gescannt (`ts.createScanner`), Wechsel zu Markup bei `<tag` in Statement-Position, `@:`,
`<text>`. Dabei entstehen/erledigen sich:

- C1, C2, C3 (Statements in Bodies, Markup in `@{}`, Brace-Pre-Scan entfällt),
- C7 (`while`/`do`/`try`/`using`/`lock`/`await` ohne Sonderknoten), C11 (Fallthrough), C20 (`@:`-Transitionen),
- C8 (`@* *@`), C9 (E-Mail-Regel: Alphanumerik vor `@` ⇒ literal),
- C14 (unquoted Attribute), Void-Close-Tags, `<DIV>`, `a < b`, `{` im ChildContent,
- **Direktiven-Tabelle** mit drei Klassen: *unterstützt* / *Blazor-only, ignoriert mit Info*
  (`@namespace`, `@rendermode`, `@preservewhitespace`, `@implements`) / *unbekannt ⇒ Fehler*.
  Direktiven nur auf Dokumentebene; `@page`/`@code` in Elementen ⇒ Fehler; mehrere `@page` ⇒
  alle als Routen (Blazor-Semantik) statt „letzte gewinnt" (C19).
- `@typeparam T where T : …` und generisches `@inherits Base<T>` sauber parsen (C19).

*Warum vor A3/A4:* Das Rewriting braucht echte Statement-Knoten mit Scopes; der heutige
Parser liefert Code nur als Text-Spans.

**Gate:** Golden-Tests für C1–C3, C7–C9, C11, C14, C19, C20 grün; Sequenznummern-Tests
unverändert grün (Invariante: compile-time, quellpositionsgebunden).

**Stand: A2 umgesetzt** (Branch `roadmap/a2-parser`). Code-Kontexte (`@{ }`, Control-Bodies)
werden mit `ts.createScanner` gescannt (`code-scanner.ts`); Brace-Pre-Scan und
Markup-Parsing von Bodies sind weg. Neue AST-Knoten: `statement` (TS-Statement-Lauf mit
`declares`), `block`, `while` (inkl. `do … while`), `try`; `@{ }` trägt `children`;
Header haben Quellpositionen (`conditionStart`/`codeStart`), Folgezeilen mehrzeiliger
Header sind gemappt. Locals aus `@{ }`/Bodies/Schleifen/`catch` landen im bestehenden
Local-Tracking (kein `this.X`). Direktiven-Tabelle: Blazor-only (`@namespace`,
`@rendermode`, `@preservewhitespace`, `@implements`) ignoriert (TZS014-Warnung nur für
`@rendermode`/`@preservewhitespace`); unbekanntes `@wort` bleibt implizite Expression
(Auflösung in A4); Direktiven außerhalb der Dokumentebene ⇒ TZS013; mehrere `@page` ⇒
`metadata.routeTemplates` + je eine Route im Manifest. `@using (…)`/`@lock`/`@await` ⇒ TZS012;
nackter Text in Code-Kontexten ⇒ TZS015 (TS-Syntaxfehler bzw. C#-Regel CS0201).
Konformität: C1–C3, C7–C9, C11, C14, C19 (Blazor-only-Direktiven), C20, Void-Close-Tag,
`a < b`, `{` im ChildContent, einzeiliges `@foreach`, `@foreach`-Header-Varianten grün; nebenbei
C6 „generic type arguments". FluentCMS-Probe: clean 13 → 145, Dateien mit Fehlern 46 → 35.
**Offen für A4:** `bakeMemberRefs` baked weiterhin Regex-Flags, Template-Spans, Typ-Positionen
und Funktionsparameter in Statements (C4–C6); `const { a, b }` kollidiert mit dem Builder-
Parameter `b` (Codegen-Hygiene: `__builder` wie Razor). Schleifen-`var` bleibt `var`.
*(In A4 erledigt.)*

### A3 — Import-Modell (Entscheidung + Umsetzung)

Heute rät das Plugin Imports per PascalCase-Regex (I1–I4). Das Rewriting in A4 braucht aber
eine **eindeutige Antwort auf „Ist `foo` ein Member oder ein freier Name?"**. Mit expliziten
Imports wird die Regel trivial und ohne Type-Checker lösbar:

> Local ⇒ bleibt · importiert ⇒ bleibt · JS/DOM-Global (aus `lib.d.ts`) ⇒ bleibt · sonst ⇒ `this.X`

Umsetzung:
- Syntax für explizite Imports in `.tsazor` (z. B. `@import { Status } from "./utils"` als
  Razor-artige Direktive, auch in `_Imports.tsazor` vererbbar). **Entscheidung nötig** (siehe unten).
- Komponenten-Tags bleiben über `@using`-Ordner/Pakete aufgelöst — aber strikt:
  Default- vs. Named-Export aus dem **tatsächlichen** Export der Zieldatei (syntaktischer
  TS-Parse), nicht aus dem Dateinamen (I3); Bare-Paket-`@using` löst nur Namen auf, die das
  Paket wirklich exportiert (Export-Liste aus dessen d.ts/Manifest), Mehrdeutigkeit
  zwischen Quellen ⇒ Fehler (I4).
- `knownGlobals`/`RUNTIME_TYPES`-Prescan entfällt (I1); Runtime-Typen werden über
  `_Imports` explizit importiert (Template liefert das Standard-Set).
- Fehlende `@using`-Ordner ⇒ Warnung.

*Warum vor A4:* A4 implementiert genau diese Regel. *Warum nicht später:* A4 ohne A3 hieße,
die Heuristik ein zweites Mal nachzubauen.

**Stand: A3 umgesetzt** (Branch `roadmap/a3-imports`). `@import <TS-Import-Klausel>` als
Direktive (alle Formen inkl. `type`, Namespace, Side-Effect, mehrzeilig; syntaktischer
TS-Parse, TZS016), in `_Imports.tsazor` vererbt, relative Specifier pro Datei umgeschrieben;
die Datei überschattet die Kette. Importierte Bindungen sind freie Namen im Rewriter
(`knownGlobals` entfällt; `@inject`-Felder gleichen Namens bleiben Member) und können direkt als
Tag dienen. `knownGlobals`-Prescan (I1) und `collectCodeImports` (I3) sind entfernt; Default vs.
Named für `@inject`/`@inherits` aus dem tatsächlichen Export der Zieldatei. Tags: umschließende
Ordner gewinnen, sonst alle `@using`-Quellen gemeinsam (Ordner, Runtime-Built-ins, Bare-Pakete
über die syntaktisch gelesene Export-Liste ihres Entry-Moduls) — Mehrdeutigkeit ⇒ TZS017,
fehlender Ordner/Paket ⇒ TZS018 (Warnung). Eine Auflösung (`resolutionOptions`) für Plugin,
Library-Builds und LSP (Shadow, Diagnostics, Hover, Completions inkl. `@import`-Namen).
Migration: Standard-Runtime-Set in jeder `_Imports.tsazor` (Apps + `components`/`fluent`),
explizite `@import`s für App-Typen/Helfer; `PizzaComponentBase` und die defensiven
`export default X` entfernt. Probe unverändert 145/217 (misst nur Markup).
**Offen für A4:** Members aus `@code`, die wie ein Import heißen (`@Parameter() Status` +
`@import { Status }`), bleiben frei statt `this.X` — braucht die Member-Liste aus dem
Klassenkörper. *(In A4 erledigt.)*

### A4 — Rewriting über TS-AST mit Scope-Analyse

`bakeMemberRefs` ersetzen: Ausdrücke und Statements mit `ts.createSourceFile` parsen,
Bindings (Parameter, Destructuring, Block-Scopes, Labels, Default-Params, `catch`) auflösen,
Typ-Positionen, Property-Keys, Template-Spans und Regex-Literale korrekt behandeln,
Shorthand `{ name }` ⇒ `{ name: this.name }`. Behebt C4, C5, C6, `new this.Foo()`.

Im selben Zug:
- Schleifenvariablen als `let` emittieren (deferred-Closure-Bug),
- `@foreach`-Header-Varianten (`Person p in …`, `var (k, v) in …`) (Review §1, mittel/niedrig),
- Method-Groups mit Receiver: `@onclick="item.toggle"` ⇒ gebundener Aufruf auf `item` (C18),
- `class="a @(x ? "b" : null)"` ⇒ `null` als leer (Blazor-Semantik).

Members kommen aus dem `@code`-Klassenkörper und dem Code-behind (syntaktisch). Für Members
aus Basisklassen (`@inherits`) gilt die A3-Regel: nicht importiert, nicht lokal, nicht global
⇒ Member — dafür wird kein Checker gebraucht.

**Gate:** alle Golden-Tests aus §1 grün außer C12/C13 (brauchen Phase 2); Pizza-E2E,
Demo-Regression, Scoped-/Code-behind-Checks grün; Pizza-Basisklassen-Workaround
(port-findings C) entfernbar.

**Stand A4 umgesetzt** (Branch `roadmap/a4-rewrite`). `bakeMemberRefs` ist ersetzt durch
`rewrite.ts`: Markup-Expressions, Attributwerte, Control-Header (`@for` als ganzes
`for`-Statement), `case`-Labels und Statement-Läufe werden mit `ts.createSourceFile`
(syntaktisch) geparst; eine Scope-Kette löst Parameter (Default-Werte im äußeren Scope),
Destructuring, Block-Scopes, `var`-Hoisting, `catch`, Schleifen, `function`/`class`/`enum`
und Labels auf. Property-Namen, Keys, Deklarationen und Typ-Positionen bleiben unberührt,
Shorthand expandiert, Template-Spans werden umgeschrieben. Freie Namen: deklarierter Member
(`@code`-Körper, Code-behind-Klasse — Plugin/LSP reichen deren Quelle durch — und
`@inject`) ⇒ `this.X` (statisch: `Klasse.X`), sonst Import/Global ⇒ bleibt, sonst `this.X`.
Die Global-Menge ist aus TypeScripts `lib.es*`/`lib.dom*.d.ts` generiert
(`packages/compiler/scripts/gen-globals.mjs`, ohne `@deprecated` wie `name`/`status`/`event`;
ein Test prüft die Aktualität). Member-Referenzen in lokalen `function`s/Objekt-Methoden
laufen über die gefangene Komponente (`const __tsazor_this = this`). Hygiene: Builder-Parameter
`__builder`, Runtime-APIs des erzeugten Codes als `__tsazor_*`-Aliase, Bind-Handler-Parameter
`__event`/`__value`; Sequenznummern unverändert. `@for`-`var` ⇒ `let`; Method-Groups mit
Receiver (`item.toggle`, auch in `On*`-Komponentenattributen) ⇒ an `item` gebunden (C18,
Receiver einmal beim Rendern ausgewertet); gemischte Attributwerte rendern `null` leer.
Konformität: C4 ×2, C5 ×9, C6 ×2, gemischte Attribute, Schleifen-Capture grün; „JS globals" und
C18 kompilieren korrekt, bleiben aber `it.fails`, weil die Runtime `true`/`false` leer rendert
(Blazor: `True`/`False`) — String-Varianten sind grün. Regression über alle 109 `.tsazor` im
Repo: nach Abzug der Hygiene-Umbenennungen identischer Code bis auf 3 gemischte Attribute
(`?? ""`). Probe unverändert 145/217.
**Offen:** Boolean-Rendering der Runtime (s. o., Track B); `var` in Statement-Läufen bleibt
`var` (JS-Semantik; nur Header-`var` wird `let`); Member von `@inherits`-Basisklassen, die wie
ein nicht-deprecated DOM-Global heißen (`length`, `parent`, `top`, `origin`, …), bleiben
global — deklarierte Member sind nicht betroffen; Code-behind-Änderungen invalidieren das
`.tsazor`-Modul nicht (Phase 4.1).

### A5 — Direktiven- und Bind-Semantik

Setzt auf dem neuen AST auf, jetzt jeweils klein:
- `@attribute [...]` ⇒ echte Decorators (C19), Doku angleichen,
- selbst geschriebenes `buildRenderTree` im `@code` ⇒ Fehler statt stillem Überschreiben (C21),
- `@bind`-Ziel über AST prüfen statt Regex: `Model!.Title`, `a?.b` (Fehler), Index-Zugriffe (C17),
- `@bind-Value:after/:get/:set` auf Komponenten (C16),
- Event-Modifier mit Wert: `@onclick:preventDefault="cond"` ⇒ dynamisches Flag, Modifier
  ohne Handler erlaubt (C15). **Braucht kleinen Runtime-Anteil** (Flag-Frame im DomRenderer) —
  unabhängig von B, kann gegen die heutige Runtime gebaut werden.

**Messpunkt:** FluentCMS-Probe erneut laufen lassen (Erwartung: fast alle Markup-Fehler weg,
verbleibend nur Slots/Templates).

**Stand: A5 umgesetzt** (Branch `roadmap/a5-bind`). **Bind-Ziele (C17):** `checkBindTarget`
(rewrite.ts) prüft auf dem TS-AST — Identifier, Member-/Element-Zugriffe, `!`, Klammern,
Type-Assertions; `?.` irgendwo im Pfad ⇒ TZS008 („not assignable“), Nicht-L-Values ebenso; die
Zuweisung ist genau der (umgeschriebene) Ausdruck, `ValueExpression` der letzte Member-Name.
**Bind-Modifier (C16):** `@bind-X:get/:set/:after/:event` auf Komponenten; `:after`/`:set`
werden awaited (Blazors `InvokeAsynchronousDelegate`), `:event` benennt auf Komponenten den
Change-Callback-Parameter (Blazor lehnt es dort nicht ab — geprüft an `ComponentBindLoweringPass`),
`:format` wird dort ignoriert (Warnung); die .NET-7-Kombinationsregeln RZ10004/RZ10015–RZ10019
gelten für Elemente und Komponenten, Attributreihenfolge egal. `ValueExpression` jetzt auch aus
`:get` (Blazor). **Event-Modifier (C15):** eigener AST-Knoten `eventModifier` ⇒
`addAttribute(seq, "__internal_preventDefault_onclick", <bool>)` wie Blazor, ohne Wert `true`;
ohne Handler erlaubt; auf Komponenten ein normales Attribut (per `@attributes` gesplattet —
FluentCMS-`Button`). Runtime (nur `dom-attributes.ts`): die Attribute setzen Flags des
Listener-Records (`modifierFlags`, journaled), ein Flag ohne Handler hält einen eigenen
Listener, der Listener geht erst, wenn weder Handler noch Flag bleiben; `EventHandlerFlags` von
`addEventHandler` bleibt (verodert). **`@attribute` (C19):** TS-Form `@attribute @dec(…)` ⇒
echter Class-Decorator (gemappt); `[Authorize]` = `@authorize`, `Roles`/`Policy` ⇒
`metadata.authorizeData` ⇒ `routeAuthorize`/Route-Manifest `authorize: { roles, policy }`
(`AuthorizationRequirements`/`AuthorizeRouteView` können beides), `[AllowAnonymous]` hebt auf,
nicht abbildbare Kombinationen ⇒ TZS019; andere C#-Attribute ⇒ TZS014. **C21:**
`buildRenderTree` in `@code` oder Code-behind ⇒ TZS020 — auch ohne Markup (Razor erzeugt
`BuildRenderTree` für jede `.razor`, CS0111). Konformität: C15 ×2, C16, C17, C19 `@attribute`,
C21 grün + 12 neue Fälle; Tests 604 → 665. Pizza-, Gallery-, Sleipnir- und Demo-E2E grün. Regression über alle 116 `.tsazor` im Repo: Ausgabe
byte-identisch (kein Repo-Code nutzt die geänderten Formen). Probe: clean 145 → 178, Dateien mit
Fehlern 35 → 1 (TZS008 ×139 und TZS001 ×1 weg, stiller Befund „Modifier-Wert“ weg).
**Offen:** `@bind-value` auf *Elementen* (`<input @bind-value="x">`, Blazor: Element-Bind auf
`value`) wird weiter als Komponenten-Bind emittiert; Bind direkt an eine `@foreach`-Variable (`@bind="item"`,
C#: CS1656) scheitert erst zur Laufzeit (Zuweisung an `const`) statt beim Compile; `[Authorize]`-Kombinationen mit mehreren Rollenlisten/Policies bräuchten
eine Liste von Requirements in der Runtime; `[Route]` ist kein `@page`-Ersatz (TZS014).

---

## Track B — Runtime

Ziel ist die Struktur von Blazor: **Renderer mit Queue → Diff pro Komponente → RenderBatch →
DOM-Applier am Batch-Ende.** Heute sind Diff und DOM-Patch ein Durchgang über Frame-Indizes;
daraus folgen R1–R4. Die Schritte bauen strikt aufeinander auf.

### B1 — Diff als reine Edit-Liste

`RenderTreeDiffBuilder` getreu portieren: geordneter Zwei-Zeiger-Walk über Sequenznummern,
Key-Dictionary nur bei Key-Abweichung, Duplicate-Key ⇒ Fehler, Key-Miss ⇒ Remove + Insert
(nicht Sequenz-Fallback). Ausgabe: Edit-Liste + Liste neu instanziierter/zu disposender
Komponenten. **Kein DOM-Zugriff** im Diff.

Behebt R1, R2, die O(n)-Moves pro Insert und die Fokusverluste; Frame-Kinder werden einmal
berechnet statt dreimal.

*Warum zuerst:* Alle weiteren Schritte konsumieren diese Edit-Liste. Die Disposal-Liste ist
Voraussetzung für R3.

**Stand: B1 umgesetzt** (gemergt in `roadmap/phase-0`). `computeDiff` (diff.ts) liefert Blazors
Edit-Typen + `components`/`disposedComponents`; der DomRenderer wendet sie an. Konformität:
R1, R2, R3 (alle drei), Insert-Kosten, Fokus grün; dazu R4-Markup (Inserts bewegen nichts
mehr, Permutationen verschieben Komponenten-/Markup-Bereiche als Einheit). Der R4-Komponenten-
Test scheitert weiter, jetzt an R5 (`shouldRender=false` verhindert den ersten Render).
Abweichungen: Edits referenzieren Frame-Indizes des neuen Baums statt kopierter
Reference-Frames (B2 muss das für mehrere Renders pro Batch klären); Attribut-Diff wechselt
bei jeder Sequenz-/Namensabweichung in den Namens-Join; `matchChildren` entfällt.

### B2 — Render-Queue mit Batches

Den vorhandenen, ungenutzten `Dispatcher` zur echten Queue machen: Parent-first-Ordnung,
Renders während eines Flushes landen im selben Batch, **Batch-Ende als definierter Punkt**,
Fehler pro Komponente isoliert (kein Abbruch des Batches, Weitergabe an einen
Error-Handler-Hook — Grundlage für ErrorBoundary in Phase 3). `activeRenderer`-Global
entfernen (pro Renderer tracken).

*Warum nach B1:* Ein Batch sammelt Edit-Listen mehrerer Komponenten — die gibt es erst ab B1.

**Stand: B2 umgesetzt** (Branch `roadmap/b2-queue`). `RenderQueue` (render-queue.ts, Heap
nach Baumtiefe) pro Renderer, Batches über den `Dispatcher`; ein Batch läuft, bis die Queue
leer ist (Renders aus Render/Lifecycle/neuen Kindern im selben Batch). Dafür fordert ein
synchroner Lifecycle seinen Render jetzt synchron an (vorher immer nach einem `await`);
async Hooks unverändert (R6 bleibt B4). Batch-Ende: `renderer.onBatchCompleted(listener)`
mit `renderedComponents` (ein Eintrag pro Pass). Fehler-Hook: `renderer.errorHandler`
(`{ error, component, phase }`), zentral über `handleComponentError` — dort setzt die
ErrorBoundary-Suche entlang der Parent-Kette (Phase 3) an. Ein Pass, der in Render/Diff/DOM
scheitert, wird verworfen (Builder und Slot-Map des Live-Baums bleiben, neu instanziierte
Kinder werden disposed; bereits angewandte DOM-Edits werden nicht zurückgerollt).
`activeRenderer` entfernt; `isRenderingInProgress` spiegelt den Batch. Frame-Referenzen:
Edits werden weiter pro Pass sofort angewandt, daher gefahrlos bei mehreren Passes pro
Batch — **B3** (Applier am Batch-Ende) muss die referenzierten Frames in den Batch kopieren
(Blazors Reference-Frames) oder die Builder bis Batch-Ende halten. Konformität: R9
„parents before children" und „exception in one component" grün; `setup.ts`
(`queueMicrotask`-Wrapper) entfällt, die Harness sammelt Fehler über den Error-Hook.
Abweichungen: Blazors `ComponentRenderQueue` ist FIFO (dort rendert ein vor dem Parent
dirty gewordenes Kind zweimal) — Parent-first ist hier gewollt; Batches starten per
Microtask statt synchron außerhalb eines Batches; Render-Schleifen-Schutz (100 Passes pro
Komponente und Batch). Offen für **B4**: `onAfterRender` läuft weiter direkt nach dem Pass
(R7) — gehört an `onBatchCompleted`.

### B3 — DOM-Applier mit Logical Ranges

Applier wendet einen ganzen Batch an. Komponenten und Markup-Blöcke sind **logische Bereiche**
(Start/End), die als Einheit verschoben und beim Entfernen rekursiv disposed werden.
Behebt R3, R4.

Im Applier gleich richtig machen (R10):
- `checked`/`value`/`selected` als Properties; `<select value>` nach den Optionen setzen,
- Listener bei `null` entfernen; Handler-Map über Eventnamen,
- getter-only-Properties nicht zuweisen (Attribut-Fallback),
- `value` beim Entfernen leeren.

**Stand: B3 umgesetzt** (Branch `roadmap/b3-applier`). `LogicalRange` (logical-range.ts):
Start-/End-Kommentar, Einfügen/Verschieben/Entfernen als Einheit, Aufzählung der logischen
Kinder, Verschachtelung; `LogicalChildren` ist der Cursor pro Ebene (Element oder Range) samt
`permute` (Blazors `permuteLogicalChildren`). Komponenten (`ComponentState.range`) und
Markup-Blöcke sind Ranges; Disposal kommt weiter aus der Disposal-Liste des Diffs, nach dem
Commit. **Batch-Anwendung — entschieden: pro Pass** (wie B2). Blazor wendet den Batch am
Stück an, weil jede Anwendung die WASM→JS-Grenze kreuzt; hier ist der Applier ein direkter
Aufruf, der Batch läuft synchron (kein Paint, kein Beobachter zwischen Passes), ein
Batch-Ende-Applier brächte nur Frame-Kopien bzw. länger gehaltene Builder. Stattdessen ist
die Anwendung **transaktional**: `DomJournal` protokolliert jede Mutation vorher bestehenden
DOMs (Positionen, Attribute, Properties, Listener, Select-Wert), ein scheiternder Pass wird
vor dem Weiterreichen des Fehlers rückwärts zurückgerollt — das DOM entspricht wieder dem
Live-Baum (B2-Punkt „teilweise angewandte Edits" erledigt). Grenzen: Seiteneffekte außerhalb
des Baums (bereits gelaufene Ref-Captures, Custom-Element-Callbacks, durch Verschieben
verlorener Fokus, Caret nach Value-Reset) bleiben. R10 (dom-attributes.ts): `value`
(input/textarea/select), `checked` (input), `selected` (option) als Property, bei
`checked`/`selected` zusätzlich das Attribut als Default; Entfernen von `value` leert (Checkbox/
Radio fallen auf „on" zurück); `<select value>` merkt sich den Sollwert und setzt ihn nach dem
Aufbau, bei neuen/geänderten Optionen (auch aus Kind-Komponenten) erneut; `true` ⇒ Attribut
`""`, `false`/`null`/`undefined` ⇒ entfernt; Handler-Map pro Eventname mit stabilem Listener
(Callback-Wechsel tauscht nur den Handler), Nicht-Handler-Wert oder Entfernen löst den Listener.
Konformität: R10-Gruppe (5) grün. Abweichungen: Primitive gehen wie in Blazor als Attribut
(vorher Property, wenn `name in element` — brach `hidden=""`, `width="100%"`, `form`/`list`);
Objekte gehen an eine *schreibbare* Property (Custom Elements), sonst als Attribut — Blazor kennt
nur Strings; der Select-Sollwert bleibt für die Lebensdauer des Elements erhalten (Blazor
vergisst ihn nach dem ersten Treffer). Zustand pro Element (Handler, Select-Sollwert) liegt als
Symbol-Property am Element wie bei Blazor (happy-dom reicht `<select>` als Proxy heraus).
Offen: SVG-Namespace (`createElement` statt `createElementNS`), `<input type=time>`-Trim.
Der R4-Test „Komponente ohne Re-Render behält ihren Inhalt" hängt weiter an R5 (**B4**).

**Aus B3 (neu, nicht im Review):** ~~SVG-Elemente werden ohne SVG-Namespace erzeugt~~ — *behoben:* `createElementNS` für `<svg>` und Kinder (außer in `<foreignObject>`), Markup in SVG wird als SVG geparst; betraf Sleipnir-Sparkline und Fluent-`Icon` (im Browser unsichtbar). Offen:
Blazors Sekunden-Kürzung für `<input type=time>` fehlt. Klein, unabhängig — vor Phase 3 erledigen.

### B4 — Lifecycle-Semantik auf Batch-Basis

Jetzt, wo es ein Batch-Ende gibt:
- async `onInitialized`/`onParametersSet`: Render, solange der Task läuft, und nach Abschluss (R6),
- `onAfterRender(firstRender)` nach dem ganzen Batch, Kinder vor Parent-Callback (R7),
- erster Render ignoriert `ShouldRender` (R5),
- Disposal Parent-first, `disposeAsync` aufrufen (R13),
- unbekannte Parameter ⇒ Fehler wie Blazor (T3), in Dev mit klarer Meldung.
  **Achtung:** Heute nutzen Apps möglicherweise Tippfehler-Parameter unbemerkt — vorher
  mit A5-Probe/Gallery prüfen.

Danach `architecture.md` und `port-findings.md` #3 korrigieren.

**Stand: B4 umgesetzt** (Branch `roadmap/b4-lifecycle`). `ComponentBase.setParametersAsync` folgt
Blazor: Parameter setzen, dann `RunInitAndSetParametersAsync`/`CallOnParametersSetAsync`. Sync
Hooks rendern weiter genau einmal im Batch des Parents; gibt ein Hook ein Promise zurück, wird
der Stand nach seinem synchronen Teil sofort gerendert und nach Abschluss erneut (nach async
`onInitialized` erst `onParametersSet`) (R6). `onAfterRender(firstRender)` läuft am Batch-Ende
(vor den `onBatchCompleted`-Listenern) für jede Komponente mit committetem Pass, einmal pro
Batch, Kinder vor Parents (tiefste zuerst, sonst Render-Reihenfolge); async wird getrackt und
rendert nicht nach (R7). `shouldRender` wird wie in Blazor in `stateHasChanged` gefragt, der
erste Render findet immer statt; HMR umgeht es (R5). Disposal Parent-first (breadth-first wie
Blazors Disposal-Queue), `disposeAsync` statt (nicht zusätzlich zu) `dispose`, getrackt (R13).
Nicht deklarierte Parameter werfen Blazors Meldung („Object of type 'X' does not have a property
matching the name 'Y'", Variante für Properties ohne `@Parameter`), Phase `lifecycle` (T3). Alle
Fehler (sync/Rejection) gehen an den Error-Hook, `waitUntilIdle` deckt Lifecycle, After-Render
und `disposeAsync` ab. **Audit T3** (Tests aller Pakete + E2E Pizza/Gallery/Sleipnir/Demo mit
temporärer Meldung statt Fehler, dazu statischer Abgleich aller Komponenten-Tags in 116
`.tsazor`-Dateien inkl. bench): keine App-Aufrufstelle betroffen; gefunden nur (1) der Compiler
emittiert `ValueExpression` bei jedem Komponenten-`@bind-Value` — Razor nur, wenn die
Komponente den Parameter deklariert; bis 2.2 verwirft die Runtime ein nicht deklariertes
`ValueExpression` —, (2) der Fluent-Layout-Test gab `Spacer` ChildContent (Test korrigiert).
Pizza: die `stateHasChanged()`-Workarounds nach awaits in `Index`, `MyOrders`,
`ConfigurePizzaDialog` entfernt (Originale rufen dort keins); `OrderDetails` (Fire-and-forget-
Poller) behält ihn. Konformität: R5, R6 ×2, R7, R13 ×2, T3 und R4 „Komponente ohne Re-Render"
grün. Abweichungen: ein `async`-Hook ohne echtes `await` rendert einmal mehr (Promise-Status
nicht synchron prüfbar); `onAfterRender` Kinder-zuerst und einmal pro Batch (Blazor: pro
Render-Eintrag in Render-Reihenfolge, also Parent zuerst). ~~Offen: Event-Handler rendern nur nach Abschluss; explizit übergebener `captureUnmatchedValues`-Parameter wird ignoriert.~~ *Beides nachgezogen:* Event-Handler rendern wie `HandleEventAsync` nach dem synchronen Teil und nach Abschluss; `captureUnmatchedValues` wird pro Parametersatz neu gebaut (explizit + ungebunden ⇒ Blazor-Fehler). Für **B5/B6**:
Kinder werden bei jedem Parent-Render neu parametriert (jedes Mal `onParametersSet` + Render,
sofern `shouldRender`); Cascades hängen weiter daran (R12 bleibt rot).

### B5 — Cascading-Subscriptions

`CascadingValue` benachrichtigt Abonnenten direkt (nicht über Parameter-Re-Sets); `Name`
unterstützen (R11, R12).

*Warum vor B6:* Heute funktionieren Cascades nur, weil jeder Parent-Render alle Kinder
neu parametriert. Das fällt mit B6 weg.

**Stand: B5 umgesetzt** (Branch `roadmap/b5-b6`). Matching wie Blazors `CanSupplyValue`
(`canSupplyValue` in renderer/cascading-value.ts): haben weder Parameter noch Supplier einen
Namen ⇒ by-type (Parameter ohne Typ-Token nimmt den nächsten unbenannten Supplier), sonst nur
by-name, case-insensitiv; ein benannter Supplier bedient keine by-type-Anfrage mehr (vorher
schon). `CascadingValue` liefert `Name` als `cascadeName` (R11) und hat `IsFixed` als Parameter
(Wechsel nach dem ersten Set wirft wie in Blazor). By-type prüft den statischen
`cascadeType` des Suppliers (Blazors `TValue`; EditForm: `EditContext`, Auth-Supplier:
`AuthenticationState` — die beiden Auth-Supplier sind dafür jetzt unbenannt wie in Blazor), ohne
ihn den Laufzeitwert (`instanceof`); ist der noch `null`/`undefined`, gilt der Supplier als
„pending": abonniert, Suche läuft weiter nach außen. **Subscriptions** (Blazors
`CascadingParameterState`/`Subscribe`): der Renderer löst Cascades bei jedem Parameter-Set frisch
auf und hält pro Consumer die nicht-fixen Supplier (`ComponentState.cascadingSuppliers`), pro
Supplier die Abonnenten (`subscribers`), dazu den letzten direkten Parameter-Snapshot des
Consumers (`directParameters`, Blazors `_latestDirectParametersSnapshot`). Vor jedem
Render-Pass eines Suppliers vergleicht er `cascadeValue` mit dem Wert des vorigen Passes
(`mayHaveChanged`, Blazors `ChangeDetection`, components/change-detection.ts); bei möglicher
Änderung bekommen alle Abonnenten Snapshot + frische Cascades direkt gesetzt (`onParametersSet`
+ Render) — unabhängig von Zwischenkomponenten (R12). Dispose meldet ab. Abweichung: Blazors
`CascadingValue` benachrichtigt aus `SetParametersAsync`; hier löst der Render-Pass des
Suppliers aus — für `CascadingValue` gleichwertig (rendert bei jedem Set), und handgeschriebene
Supplier (Tabs, Accordion, FluentProvider, Auth, EditForm, …) brauchen keinen eigenen
Notify-Aufruf, nur ein Re-Render bei Wertänderung. Objektwerte (auch `this`) gelten wie in
Blazor stets als geändert. Konformität: R11, R12 grün.

### B6 — Parameter-Change-Detection

Blazors `MayHaveChanged`: unveränderte Primitive/Immutables ⇒ kein `setParameters`.
`findParameterMetadata` pro Klasse cachen. (R8, Performance)

*Warum erst hier:* R8 kaschiert heute R4 und R12. Vorher eingebaut, würden Moves und
Cascades sichtbar brechen.

**Stand: B6 umgesetzt** (Branch `roadmap/b5-b6`). `updateChildren` setzt einem behaltenen Kind
nur dann Parameter, wenn einer sich geändert haben kann — Port von `ParameterView.DefinitelyEquals`
(`parametersDefinitelyEqual`, renderer.ts): gleiche Attributnamen in gleicher Reihenfolge
(Umordnung zählt wie in Blazor als Änderung), kein Wert `mayHaveChanged`, gleicher
Komponententyp (HMR). Cascades kommen über die B5-Subscription, nicht über den Parent-Render.
**Gleichheitsregeln** (`mayHaveChanged`, components/change-detection.ts): bekannt immutable und
per `Object.is` verglichen sind string, number, boolean, bigint, symbol (TS-Enums sind
number/string); `null`/`undefined` sind nur sich selbst gleich; `EventCallback` gleich bei
gleichem Receiver + Delegate (Blazor zählt `EventCallback` seit .NET 7 zu den immutablen Typen;
ein weitergereichter, pro Render neu gebundener Callback vergleicht den inneren). Alles andere —
Objekte, Arrays, Funktionen (also jedes `ChildContent`/`RenderFragment`), **Date** — gilt als
möglicherweise geändert. Abweichungen: `Date` ist in JS eine veränderliche Referenz (Blazors
`DateTime` ein Werttyp) und zählt daher nicht als immutable; `0`/`-0` gelten als verschieden
(`Object.is`); eine Arrow-Funktion ist pro Render neu, ein `@onclick="() => …"`-EventCallback also
immer geändert — C# vergleicht Delegates über Target + Methode, dort ist ein nur `this`
fangendes Lambda gleich. Eine rohe Funktion auf einem `on*`-Parameter gilt bei gleicher Referenz
als unverändert (sie wird zum `EventCallback` mit demselben Parent gebunden). **Metadaten-Cache:**
`getParameterInfo` baut pro Klasse einmal alle Parameter inkl. geerbter, die case-gefaltete
Namenstabelle, das Capture-Property und die Cascading-Liste; jede Decorator-Registrierung
invalidiert (Versionszähler). `attributeValueEquals` (toter Code) entfernt. **Maskierte Bugs:**
keine in Apps/Paketen gefunden — alle Tests + E2E grün; angepasst wurden nur drei Runtime-Tests,
die das alte Verhalten festschrieben (render-queue ×2 „until B6", lifecycle After-Render-Test
bekommt einen sich ändernden Parameter). Konformität: R8 grün; die Runtime-Suite ist grün bis auf
fremd verantwortete Punkte (`/^on/i` → B8, EditForm-Submit ×2 → 3.5, Router ×6 → B7).

**Gate für B1–B6:** Konformitätssuite (0.4) vollständig grün; Pizza-/Sleipnir-E2E grün;
Benchmark (`apps/bench`) nicht schlechter.

### B7 — Router und Navigation (unabhängig, jederzeit nach Phase 0)

Routen-Präzedenz wie Blazor (Literal vor Parameter vor Catch-all, Constraints erhöhen
Spezifität); Constraint-Regexe gruppieren; `bool` case-insensitiv korrekt konvertieren;
optionale Parameter `{id:int?}`; `double`/`decimal`/`float`/`datetime`; `long` als `bigint`
oder String mit Validierung; Catch-all nicht re-encoden; Navigation-Lock wirksam;
`<base href>`; `app.dispose()` räumt DOM und Listener ab (R14, R15). Auth-Race im
`AuthenticationStateProvider` beheben.

**Stand: B7 umgesetzt** (Branch `roadmap/b7-router`). `RouteTable` (route-data.ts) sortiert nach
Blazors `RouteComparison` (pro Segment von links: Literal < Parameter mit Constraint < Parameter <
Catch-all mit Constraint < Catch-all, bei Gleichstand weniger Segmente zuerst; stabil, sonst
Manifest-Reihenfolge) und wirft beim Aufbau (Router `onParametersSet`) Blazors „The following
routes are ambiguous“, wenn zwei Routen gleicher Präzedenz dieselben URLs abdecken (gleiche
Literale, gleiche Constraints — .NET-8-Regel; Parametername egal). Template-Parser mit Blazors
Fehlern (leere Segmente, Klammern, Catch-all nicht zuletzt, Pflicht nach optional, doppelte Namen,
optionaler Catch-all, unbekanntes Constraint). Constraints verankert/gruppiert (`^(?:…)$`):
`int` (32 Bit), `long` (**`bigint`**, 64-Bit-Bereich), `bool` (case-insensitiv), `double`/`float`/
`decimal` (number), `datetime` (Date, ISO), `guid` (D/N/B/P, String), `alpha`, `alphaNumeric`,
`regex(...)`; optional `{x?}`/`{x:int?}` ⇒ `null`; Catch-all `{*p}`/`{**p}` **dekodiert** (wie
Blazor: Segmente werden vor dem Matching dekodiert, außer `%2F` wie ab .NET 8), leer ⇒ `null`,
Constraint pro Segment; Parameter anderer `@page`-Templates derselben Seite ⇒ `null`
(`UnusedRouteParameterNames`). Manifest-Format (vite-plugin) unverändert.
`NavigationManager`: `registerLocationChangingHandler` (+ `setNavigationLock`/`releaseNavigationLock`
als Wrapper, neue Komponente `NavigationLock` mit `onBeforeInternalNavigation`/
`confirmExternalNavigation`). `navigateTo` fragt die Handler zuerst (auch bei `forceLoad`/extern,
wie Blazor WASM), Abbruch per `preventNavigation()`, werfender Handler oder neuere Navigation
(`signal` abgebrochen); Link-Klicks (nur innerhalb des Base-URI-Raums, `isNavigationIntercepted`)
gehen durch dieselben Handler; `popstate` mit Handlern: Bewegung per `history.go(-delta)`
zurücknehmen (`_index` in `history.state`), fragen, bei Erlaubnis erneut anwenden — ein
abgebrochenes Zurück behält die alte URL (Eintrag ohne `_index`: alte URL per `replaceState`).
Ohne Handler bleibt alles synchron. `baseUri` aus `<base href>`, `toAbsoluteUri`/
`toBaseRelativePath` (wirft außerhalb der Base) wie Blazor, `navigateTo(uri, forceLoad, replace)` und
`NavigationOptions` (`replaceHistoryEntry`, `historyEntryState`). `app.dispose()`: Baum disposen,
DOM-Range entfernen, eigenen NavigationManager (Klick + popstate) disposen, HMR-Bridge entfernen.
Auth: `watchAuthenticationState` versieht den initialen `getState()` mit der
Notification-Version des Providers; ein spätes Ergebnis nach einer Notification (oder nach
Unsubscribe) wird verworfen. Konformität: R14 ×5, R15 grün, neu: Ambiguität, `long` > 2^53,
`regex(a|b)`, Lock gegen Link-Klick und popstate, `<base href>`, `app.dispose()`, Auth-Race.
Abweichungen: ohne `<base>`-Element ist die Base der Origin-Root (Blazor: Verzeichnis der
Dokument-URL; Vite-Apps haben meist kein `<base>`); `regex(...)` wird verankert (ASP.NET überlässt
das dem Pattern); `decimal` als number; `guid` bleibt String; `datetime` nur ISO; ein von außen
übergebener NavigationManager wird von `app.dispose()` nicht disposed; `baseRelativePath` wirft
außerhalb der Base nicht (Origin-relativer Pfad).

---

### A6 — TS-Bereinigung (vor Phase 2)

Nach [design-principles.md](design-principles.md): Code ist sauberes TypeScript. Bisher still
akzeptierte C#-Formen werden Diagnosen mit dem TS-Gegenstück (Quick-Fix kommt mit 2.5):
- `@foreach (var x in xs)` / `(string s in xs)` / `(var (k, v) in xs)` ⇒ Fehler, TS-Form
  `@foreach (const x of xs)` (in TS bedeutet `for…in` Schlüssel-Iteration),
- `var` in `@for`-Köpfen wird nicht mehr still zu `let` — wie geschrieben emittieren + Warnung,
- `@switch`-Sektion ohne `break` ⇒ TS-Fallthrough + Warnung (statt implizitem `break`),
- `@attribute [C#-Attribut]` ⇒ Fehler mit Hinweis; kanonisch `@authorize`/`@authorize({ roles, policy })`
  und `@attribute @decorator(…)`,
- `@typeparam T where T : …` ⇒ Fehler mit Hinweis auf `extends`,
- **Standard-Decorators** (TC39) statt `experimentalDecorators`/`useDefineForClassFields: false`
  für `@Parameter`, `@CascadingParameter` u. a. — vor 2.1, weil 2.1 die Parameter-Metadaten
  ohnehin neu ausliest.

Migration der Repo-Apps/-Libraries im selben Schritt; die FluentCMS-Probe misst danach, was ein
Codemod übernehmen muss.

**Stand: A6a umgesetzt** (gemergt).
Neue Codes: **TZS021** (Fehler) C#-Form mit mechanischem TS-Gegenstück, die Meldung nennt die
TS-Form; **TZS022** (Warnung) `var` in Render-Code; **TZS023** (Warnung) durchfallende
`@switch`-Section. Regeln: `@foreach`-Köpfe sind TS (`const`/`let`, Destructuring; `for…in`
iteriert Schlüssel wie in TS); `var x in xs`, `string s in xs`, `var (k, v) in xs` ⇒ TZS021
(`'@foreach (const x of xs)' — in TypeScript, for…in iterates keys`), zur Fehlererholung als
diese TS-Form kompiliert; Zählköpfe unter `@foreach` ⇒ TZS015. `var` wird wie geschrieben
emittiert (kein `var`→`let` mehr in `@for`), bleibt function-scoped (Local auch nach der
Schleife) ⇒ TZS022. `@switch`: Sections teilen den Case-Block (kein generierter
`case X: { … }`-Block mehr — er hätte TS-Scoping verändert), kein implizites `break`, TZS023 wie
`noFallthroughCasesInSwitch` (gestapelte leere Labels und letzte Section still; Sprung am Ende
eines Blocks oder in allen if/else-Zweigen zählt). `@attribute [X]` ⇒ TZS021 mit TS-Form
(`[Authorize(Roles = "A, B")]` ⇒ `@authorize({ roles: ["A", "B"] })`, `[AllowAnonymous]` ⇒
entfernen, `[Route]` ⇒ `@page`, sonst Decorator/entfernen); `@authorize({ roles, policy })` als
TS-Objektliteral (TS-Parser, nur Literale, mehrzeilig erlaubt; sonst TZS019), Manifest-Form wie
A5. `@authorize` wird **nicht** über `_Imports` vererbt (dort TZS014-Warnung) ⇒ kein Opt-out
nötig. `@typeparam T where T : X` ⇒ TZS021 (`'@typeparam T extends X'`). Migriert: 9
`@foreach`-Köpfe in Pizza und Bench; Repo-Build ohne Warnungen. Probe: neue Kategorie „C#-Formen
(codemod-fixable)“ (siehe 0.5). Gates: 752/752 Tests, LSP-Smokes, Pizza, Gallery, Sleipnir,
Demo (components 31, scoped, code-behind, debugging, counter-state) grün.
**Offen für den Codemod (2.5):** `foreach … in` ⇒ `const … of` (35× in FluentCMS),
`[Authorize(…)]` ⇒ `@authorize({…})`, `[AllowAnonymous]`/`[CascadingTypeParameter]`/
`[StreamRendering]` entfernen, `where` ⇒ `extends`, `var` ⇒ `let`/`const` (4×); die Meldungen
liefern die Ziel-Texte. ~~Eine Quick-Fix-Range fehlt noch~~ — seit A7 tragen alle Diagnosen
einen Bereich, die mechanischen Formen ein `fix` (Ersatzbereich + Text; LSP-Code-Action).

**Stand A6b (Standard-Decorators, erledigt):** `@Parameter`/`@CascadingParameter` sind
TC39-Field-Decorators (auch `accessor`/Setter), Metadaten pro Klasse in
`Klasse[Symbol.metadata]` (privater Schlüssel, eigene Map pro Klasse, Lesen über die
Klassenkette, B6-Cache bleibt; `defineParameter` für Decorator-freie Komponenten).
`Symbol.metadata`-Polyfill im Blatt-Modul `parameter-metadata.ts` (ESM-Reihenfolge vor jeder
dekorierten Klasse). `experimentalDecorators`/`useDefineForClassFields: false` aus allen
tsconfigs, esbuild-/Vitest-Configs, Build-Skripten und dem LSP entfernt; esbuild senkt
Decorators (`supported: { decorators: false }`), das Vite-Plugin auch für die `.ts`-Dateien der
App. `[[Define]]`-Felder: Runtime war schon so kompiliert (tsc, ES2022); neu ist der generierte
Code — kein Feld der generierten Klasse überschattet Code-behind-Member (nur `@inject`/`@code`),
HMR entfernt Felder, die zum Accessor wurden. Bundle (Bench): Standard-Lowering kostet
+3,6 KB gz, `"sideEffects"` im Runtime-Paket (nur das Polyfill-Modul) lässt ungenutzte
Built-ins fallen ⇒ netto **22,7 → 20,4 KB gz**. Für 2.1: die Laufzeit-Metadaten sind pro Klasse
und vererbungsrichtig lesbar; Typen/Kategorien liefert 2.1 statisch aus dem AST.

---

## Phase 2 — Parameter-Typ-Metadaten und Typecheck

**Voraussetzung:** Track A fertig (Metadaten werden aus dem neuen AST gewonnen; Shadows sind
Compiler-Output mit korrekten Maps). Track B muss hier noch nicht fertig sein.

### 2.1 — Parameter-Metadaten pro Komponente

Aus dem TS-AST jeder Komponente (inkl. Code-behind): Parameter-Name, deklarierter Typ,
Kategorie (`string` / sonstiger Wert / `EventCallback` / `RenderFragment` /
`RenderFragment<T>`), `@typeparam`s, Cascading-Parameter. Syntaktisch ausreichend für die
Codegen; der Plugin-Resolver liefert sie für Ziel-Komponenten (analog `resolveComponent`).
Fertige Pakete (`components`, `fluent`) liefern sie als Manifest.

**Stand: 2.1 umgesetzt** (Branch `roadmap/p2-1-metadata`; Modell in
[architecture.md](architecture.md#parameter-metadaten-21)). Extraktor + Auflösung in
`@tsazor/compiler` (`metadata.ts`, syntaktisch, Host-basiert), Dateisystem-Host,
Cache und Manifeste in `@tsazor/workspace` (`metadata.ts`). Kategorien `string` /
`value` / `EventCallback` / `EventCallback<T>` / `RenderFragment` /
`RenderFragment<T>` / `captureUnmatchedValues` aus der Annotation (Unions, `?:`,
umbenannte und Namespace-Runtime-Imports, lokale und relativ importierte Aliase,
Funktionstyp `(x: T) => RenderFragment`), Typ als Quelltext + Bindungen der
Typnamen (`references`, für 2.4), `@typeparam`s/Klassen-Typparameter,
Cascading-Optionen, JSDoc. Vererbung über `@inherits`/`extends`/Code-behind über
Dateien und in das Runtime-Manifest, Typargumente eingesetzt (`InputBase<string>`).
`FileContext.resolveComponentMetadata(tag, usings, imports)` →
`CompileOptions.resolveComponentMetadata` (Codegen liest es noch nicht —
alle 117 Repo-`.tsazor` vorher/nachher byte-identisch inkl. Sourcemaps, ebenso
`components`/`fluent`-dist). Manifeste `dist/tsazor-components.json` (`package.json`
`tsazor.components`) aus den Builds von runtime, components, fluent; Runtime-Manifest
in den Workspace eingebettet, `RUNTIME_COMPONENTS` daraus abgeleitet,
`RUNTIME_COMPONENT_PARAMS` entfernt; Sync-Tests gegen Quellen und `getParameterInfo`.
Cache pro Datei (mtime+Größe) mit Abhängigkeitskanten (Code-behind, `_Imports`,
Basisdateien, Manifeste) und `dependentsOf`/`invalidate` für 4.1. LSP:
Attribut-Completion aus den Metadaten (inkl. geerbter Parameter, ohne Cascading,
`@bind-X` nur mit `XChanged`-EventCallback). Gates: 842/842 Tests, LSP-Smokes,
Pizza, Gallery, Sleipnir, Demo (components 31, scoped 10, code-behind 5,
debugging 14, counter-state 8) grün.
**Offen für 2.2/2.3/2.4:** Codegen auf `category` umstellen (C12, Sync B8,
unbekannte Parameter ⇒ Fehler; `uncertain` dort als Warnung statt Fehler);
Slot-Erkennung über `RenderFragment`/`RenderFragment<T>`-Parameter und
`typeParameters` für `TItem` (2.3); `references` + `file` für Typ-Imports im Shadow
(2.4 — paketrelative `file`-Pfade zeigen in `src/`, das die Pakete mitliefern);
Typen aus Fremd-Paketen ohne Manifest bleiben `uncertain`; eine neu angelegte
`_Imports.tsazor` invalidiert den Cache nicht selbst (4.1).

### 2.2 — Metadaten-gestützte Codegen

- Statische Attributwerte auf Nicht-String-Parametern sind Ausdrücke (`Count="5"` ⇒ `5`,
  `OnClick="Handle"` ⇒ Method-Group) (C12),
- `EventCallback`-Parameter werden vom Compiler explizit erzeugt ⇒
  **Sync-Punkt B8:** Runtime-Heuristik `/^on/i` (renderer.ts:14, 108) entfernen, falscher
  Receiver entfällt,
- Unbekannte Parameter ⇒ Compile-Fehler (statisches Pendant zu T3).

### 2.3 — Templated Components

Benannte Slots (`<RowTemplate>`), `RenderFragment<T>` mit `@context` und `Context="x"`,
`TItem`-Angabe/Inferenz, Slot vs. Komponente anhand der Metadaten unterscheiden (C13).
Danach: `App.tsazor`-Templates (`<Found Context="routeData">`, `NotAuthorized`) im
fluentcms-Port und gallery-Table ohne handgeschriebenen `RenderTreeBuilder`-Code.

*Warum hier und nicht in Phase 3:* Ohne 2.1 nicht unterscheidbar, ob `<Found>` ein Slot oder
eine Komponente ist; und 2.4 soll Slots bereits typisiert prüfen.

### 2.4 — Typisierte Shadows und `tsazor check`

- Shadow emittiert Prop-Prüfungen pro Komponenten-Tag (z. B. `satisfies Partial<ParamsOf<T>>`),
  Slot-Kontexttypen, `@ref`-Typen (behebt TS2740-False-Positive) (T2),
- Shadows für **alle** Projektdateien, nicht nur offene (T4),
- CLI `tsazor check` (Exit-Code ≠ 0 bei Fehlern) + optionaler Vite-Hook (T1),
- echte `.d.ts` pro Komponente mit typisierten Parametern; Ambient-Types für `*.tsazor` /
  `virtual:tsazor-routes` als `@tsazor/vite-plugin/client` (ersetzt die vier kopierten
  `types.d.ts`),
- `tsazor check` in die Gates aller Apps aufnehmen. **Messpunkt:** die zwei
  `RedirectToLogin`-Bugs müssen gemeldet werden.

### 2.5 — LSP projektweit

Multi-Root und pro App die richtige tsconfig (statt `workspaceFolders[0]`),
`didChangeWatchedFiles`, Re-Check abhängiger Dokumente, korrekte Diagnostic-Ranges,
Completion aus den Metadaten (2.1) statt v1-Regex.

**Codemod `.razor` → `.tsazor`** (neu, Prinzip 4): mechanische Übersetzung der C#-Reste —
`foreach … in`, `$"…"` ⇒ Template-Literal, `[Attribute]` ⇒ `@authorize`/Decorator, `where` ⇒
`extends`, PascalCase-API-Aufrufe ⇒ camelCase, DataAnnotations ⇒ Validierungsmodell (3.6). Dieselben
Regeln als LSP-Quick-Fixes. Messgröße: Handarbeit nach Codemod auf der FluentCMS-Probe.

---

## Phase 3 — Parität: Built-ins und Formulare

**Voraussetzung:** B2 (Fehlerisolation), B3/B4 (Disposal, Lifecycle), 2.3 (Slots).

| Schritt | Inhalt | Abhängig von |
|---|---|---|
| 3.1 | `ErrorBoundary` (`ChildContent`, `ErrorContent` mit Kontext, `Recover()`) | B2-Error-Hook, 2.3 |
| 3.2 | `DynamicComponent` (`Type`, `Parameters`) | 2.1 (Parameter-Validierung zur Laufzeit) |
| 3.3 | `MarkupString`: Compiler erkennt den Typ in `addContent` ⇒ Markup-Frame | A4, 2.1 |
| 3.4 | `HeadContent`/`HeadOutlet`, `FocusOnNavigate` | B3 (Logical Ranges außerhalb des Roots) |
| 3.5 | EditForm: `OnSubmit`/`OnInvalidSubmit`, `onValidSubmit` awaiten und tracken | B4 |
| 3.6 | Validierungsmodell entscheiden und umsetzen: Decorator-basiert (`@Required()`, `@MaxLength()`) als DataAnnotations-Pendant **oder** Beibehaltung der Funktions-Map plus Adapter | 2.1 (Decorator-Metadaten); Entscheidung vor 5.2 |
| 3.7 | `InputFile`, `SupplyParameterFromQuery`, `@bind:format` (Datum/Zahl, Kultur) | B7 (Query), A5 |
| 3.8 | DI: Scoped-Lifetime, Zyklus-Erkennung | — |

**Messpunkt:** FluentCMS-Probe + erste portierte FluentCMS-Admin-Seiten (CRUD-Plugins nutzen
PluginForm, Slots und `@bind` in Masse).

---

## Phase 4 — Dev-Server und Komponenten-Library

### 4.1 — HMR und Invalidierung

`handleHotUpdate`/`addWatchFile`: Abhängigkeitsgraph aus dem Import-Modell (A3) — neue
Komponente ⇒ Dateien mit vorher unaufgelöstem Tag neu transformieren; `_Imports.tsazor`-
Änderung ⇒ alle Dateien darunter; Sidecar `.tsazor.css`/`.tsazor.ts` hinzufügen/entfernen;
neue/entfernte `@page` ⇒ Routen-Manifest. Windows-Pfadvergleich case-insensitiv normalisieren;
Routen-Scan auf `src` begrenzen. Tests für Invalidierung und Windows-Pfade.

*Warum erst hier:* Der Graph hängt vollständig am Import-Modell (A3) und an den Metadaten (2.1);
vorher gebaut, müsste er neu geschrieben werden.

### 4.2 — Fluent-Überarbeitung

Nach 2.3 (Slots) und 2.4 (Typen), weil sich die API ohnehin ändert:
- ~~Parameter auf PascalCase~~ — *entschieden: nein* (camelCase-Member, Markup ordnet case-insensitiv zu; [design-principles.md](design-principles.md)),
- Enum-artige Parameter als Union-Typen, einheitliches Vokabular,
- `@attributes`-Weitergabe überall, `aria-*` rendern (Button),
- automatisch eindeutige IDs für Label/Message-Zuordnung, `role="alert"` nur bei Submit-Fehlern,
- Templated-Komponenten (DataGrid, Table mit `RenderFragment<T>`) nachziehen.

---

## Phase 5 — Externe Nutzung und .NET-Brücke

### 5.1 — Paketierung

Exports/`types` für alle Pakete, `license`-Felder, vite-plugin-Deps bereinigen (gebündelt ⇒
keine Laufzeit-Deps), externer Smoke-Test (Tarball-Install + `vite build` + Vitest +
`tsazor check`) als CI-Gate. Getting-Started gegen das echte Ergebnis prüfen.

### 5.2 — `@tsazor/dotnet` (Arbeitstitel)

Ein offizieller Weg statt drei App-eigener:
- OpenAPI ⇒ typisierter TS-Client mit korrekter Nullability,
- ProblemDetails / Envelope-Fehler als typisierte Ergebnisse (`TsazorHttp` darf bei `!ok`
  nicht werfen, bevor der Body lesbar ist),
- DataAnnotations aus dem OpenAPI-Schema ⇒ Validatoren im Modell aus 3.6,
- Auth-Anbindung (JWT/Cookie) an `AuthenticationStateProvider`.

*Warum zuletzt:* Hängt am Validierungsmodell (3.6), an typisierten Komponenten (2.4) und an
sauberer Paketierung (5.1). Als Referenzfälle dienen FluentCMS (OpenAPI) und Sleipnir.

---

## Entscheidungen, die vor dem jeweiligen Schritt fallen müssen

| Wann | Frage | Empfehlung |
|---|---|---|
| vor A3 | Syntax für explizite Imports in `.tsazor` | **Entschieden (2026-09-30):** `@import { X } from "./y"` als Direktive (Razor-Stil, über `_Imports.tsazor` vererbbar) |
| vor B4 | Unbekannte Parameter: Fehler wie Blazor oder nur Warnung? | **Entschieden (2026-09-30):** Fehler wie Blazor (Laufzeit ab B4; statisch zusätzlich ab 2.2) |
| vor 3.6 | Validierung: Decorators (DataAnnotations-nah) oder Funktions-Map? | Decorators — ermöglicht 5.2 (Schema ⇒ Validatoren) |
| vor 4.2 | Fluent auf PascalCase umstellen? | **Entschieden (2026-10-01): nein** — Members bleiben camelCase, PascalCase-Markup ordnet case-insensitiv zu (Design-Prinzipien) |

## Begleitend in jeder Phase

- Doku im selben Commit wie das Verhalten ändern (Review §7: Doku-Drift).
- Gates: Package-Tests, Golden-/Konformitätssuite, Pizza-E2E, Sleipnir-E2E, Demo-Regression,
  FluentCMS-Probe (Metrik protokollieren).
- Der fluentcms-admin-Port läuft als Validierung mit; nennenswert weiter portiert wird erst
  ab Ende Phase 2 (Slots + Typecheck), weil vorher portierter Code Workarounds enthielte, die
  danach wieder entfernt werden müssten.
