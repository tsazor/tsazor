# Roadmap — Behebung der Review-Befunde

Grundlage: [review-2026-09-30.md](review-2026-09-30.md). IDs (C…, R…, T…, I…) verweisen dorthin.

**Ordnungsprinzip:** Reihenfolge nach technischen Abhängigkeiten, nicht nach Aufwand.
Ein Schritt kommt erst, wenn das, worauf er aufbaut, korrekt ist — sonst wird er zweimal
gebaut. Quick Wins werden deshalb nicht vorgezogen, sondern dort erledigt, wo sie im neuen
Code ohnehin entstehen (viele verschwinden durch den Umbau von selbst).

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

**Stand:** 0.1 und 0.2 erledigt (Branch `roadmap/phase-0`). Dabei zusätzlich behoben:
`.tsbuildinfo` von `runtime` lag außerhalb von `dist` (Clean-Build lieferte leeres `dist`);
Pizza-E2E (Klick verfehlte Button durch Layout-Shift der Live-Validierung seit `fa680e2`;
Poller-Request-Sturm, siehe Review C12-Nachtrag) und Sleipnir-E2E (las Platzhalter vor den
Daten) — beide Fehler bestanden schon vor Phase 0.

| Schritt | Inhalt | Warum hier |
|---|---|---|
| 0.1 | `pnpm install` / `node_modules` reparieren; `packages/vscode` Workspace-Deps (`@tsazor/lsp`, `@tsazor/workspace`) deklarieren, sodass sauberes `pnpm -r build` durchläuft | Alles Weitere braucht grüne Gates |
| 0.2 | ESM-Ausgabe Node-ladbar machen: `module: NodeNext` + `.js`-Endungen (oder Bundling pro Paket); fehlende Deps (`@jridgewell/gen-mapping` im compiler) | `tsazor check`-CLI (2.4), Test-Skripte und `@tsazor/testing` laufen in Node — nicht erst beim Publishing relevant |
| 0.3 | **Compiler-Golden-Tests:** alle Repros aus §1 des Reviews als Snapshot-Tests (Eingabe → erwartete Ausgabe bzw. Diagnostic), zunächst als `it.fails` markiert | Zielbild des Umbaus A; jeder Fix kippt einen Test von „fails" auf grün |
| 0.4 | **Runtime-Konformitätssuite:** Blazor-Semantik festschreiben — Lifecycle-Reihenfolge, Loading-Render bei async `onInitialized`, `OnAfterRender` nach Batch, `@key`-Neuanlage, Duplicate-Key-Fehler, Disposal verschachtelter Komponenten, Moves, `ShouldRender` beim ersten Render, Parent-first. Repros R1–R15, als `it.fails` | Zielbild von Track B; ohne sie ist „Blazor 1:1" nicht überprüfbar |
| 0.5 | **FluentCMS-Probe als Messskript** ins Repo (`scripts/probe-razor-corpus.mjs`): klont Upstream, kompiliert alle `.razor`, zählt Diagnostics und stille Fehler. Upstream wird nicht eingecheckt | Fortschrittsmetrik über alle Phasen (Ausgangswert: 17/217 korrekt) |

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

### B2 — Render-Queue mit Batches

Den vorhandenen, ungenutzten `Dispatcher` zur echten Queue machen: Parent-first-Ordnung,
Renders während eines Flushes landen im selben Batch, **Batch-Ende als definierter Punkt**,
Fehler pro Komponente isoliert (kein Abbruch des Batches, Weitergabe an einen
Error-Handler-Hook — Grundlage für ErrorBoundary in Phase 3). `activeRenderer`-Global
entfernen (pro Renderer tracken).

*Warum nach B1:* Ein Batch sammelt Edit-Listen mehrerer Komponenten — die gibt es erst ab B1.

### B3 — DOM-Applier mit Logical Ranges

Applier wendet einen ganzen Batch an. Komponenten und Markup-Blöcke sind **logische Bereiche**
(Start/End), die als Einheit verschoben und beim Entfernen rekursiv disposed werden.
Behebt R3, R4.

Im Applier gleich richtig machen (R10):
- `checked`/`value`/`selected` als Properties; `<select value>` nach den Optionen setzen,
- Listener bei `null` entfernen; Handler-Map über Eventnamen,
- getter-only-Properties nicht zuweisen (Attribut-Fallback),
- `value` beim Entfernen leeren.

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

### B5 — Cascading-Subscriptions

`CascadingValue` benachrichtigt Abonnenten direkt (nicht über Parameter-Re-Sets); `Name`
unterstützen (R11, R12).

*Warum vor B6:* Heute funktionieren Cascades nur, weil jeder Parent-Render alle Kinder
neu parametriert. Das fällt mit B6 weg.

### B6 — Parameter-Change-Detection

Blazors `MayHaveChanged`: unveränderte Primitive/Immutables ⇒ kein `setParameters`.
`findParameterMetadata` pro Klasse cachen. (R8, Performance)

*Warum erst hier:* R8 kaschiert heute R4 und R12. Vorher eingebaut, würden Moves und
Cascades sichtbar brechen.

**Gate für B1–B6:** Konformitätssuite (0.4) vollständig grün; Pizza-/Sleipnir-E2E grün;
Benchmark (`apps/bench`) nicht schlechter.

### B7 — Router und Navigation (unabhängig, jederzeit nach Phase 0)

Routen-Präzedenz wie Blazor (Literal vor Parameter vor Catch-all, Constraints erhöhen
Spezifität); Constraint-Regexe gruppieren; `bool` case-insensitiv korrekt konvertieren;
optionale Parameter `{id:int?}`; `double`/`decimal`/`float`/`datetime`; `long` als `bigint`
oder String mit Validierung; Catch-all nicht re-encoden; Navigation-Lock wirksam;
`<base href>`; `app.dispose()` räumt DOM und Listener ab (R14, R15). Auth-Race im
`AuthenticationStateProvider` beheben.

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
- Parameter auf PascalCase (Blazor-/FluentUI-Blazor-Konvention) — **Breaking**, einmalig,
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
| vor A3 | Syntax für explizite Imports in `.tsazor` | `@import …` als Direktive (Razor-Stil, in `_Imports` vererbbar) |
| vor B4 | Unbekannte Parameter: Fehler wie Blazor oder nur Warnung? | Fehler (Blazor-Semantik); Compiler meldet sie ab 2.2 ohnehin statisch |
| vor 3.6 | Validierung: Decorators (DataAnnotations-nah) oder Funktions-Map? | Decorators — ermöglicht 5.2 (Schema ⇒ Validatoren) |
| vor 4.2 | Fluent auf PascalCase umstellen? | Ja, einmalig, gemeinsam mit den Slot-Umstellungen |

## Begleitend in jeder Phase

- Doku im selben Commit wie das Verhalten ändern (Review §7: Doku-Drift).
- Gates: Package-Tests, Golden-/Konformitätssuite, Pizza-E2E, Sleipnir-E2E, Demo-Regression,
  FluentCMS-Probe (Metrik protokollieren).
- Der fluentcms-admin-Port läuft als Validierung mit; nennenswert weiter portiert wird erst
  ab Ende Phase 2 (Slots + Typecheck), weil vorher portierter Code Workarounds enthielte, die
  danach wieder entfernt werden müssten.
