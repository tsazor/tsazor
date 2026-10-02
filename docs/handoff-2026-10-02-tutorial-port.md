# Handoff: Tutorial, Erweiterungen, Business-SPA-Port (Stand 2026-10-02, Neustart)

Sitzungsziel nach den Phasen 2–5: englische Doku, interaktives Tutorial, Tsazor-Erweiterungen,
Profilschärfung und ein erster echter Port einer Firmen-SPA. **Zuerst lesen:** dieses Dokument,
dann [roadmap-1.0.md](roadmap-1.0.md) als Gesamtübersicht.

## Stand `roadmap/phase-0` (HEAD nach diesem Handoff-Commit; über 40 Commits vor `origin`, nicht gepusht)

Gemergt in dieser Sitzung:
- **`docs/english`**: Nutzer-Doku auf Englisch und auf den aktuellen Stand gebracht. Interne
  Dokumente (roadmap*, handoffs, reviews, port-findings, design-2.4) bleiben deutsch.
- **Tutorial `apps/tutorial`** (`pnpm --filter tutorial dev`, :5330):
  - Svelte-Stil: links Text, rechts Editor (CodeMirror) mit Live-Preview im sandboxed iframe.
  - Compiler und `tsazor check` laufen im Browser (Web Worker).
  - Zwei Tracks: **TS = Haupttrack**, Blazor = „kennst du, das ist anders“.
  - M1 und M2 decken Teil 1 ab (Kapitel 1–7), M3 Teil 2 (Kapitel 8–13).
  - Dazu im Blazor-Track das Kapitel „TypeScript for C# developers“ (9 Lektionen) und der
    Spickzettel `docs/csharp-to-typescript.md`.
  - Gates: `pnpm --filter tutorial test` (Lesson-Gate und Claims-Tests) und
    `pnpm --filter tutorial verify` (E2E in Edge).
- **Tsazor-Erweiterungen** ([design-bindable-observe.md](design-bindable-observe.md)):
  - `@Bindable() accessor value` mit Diagnose TZS030.
  - `this.observe(source)`; der Name war zuerst `track` und wurde wegen Namenskollisionen
    umbenannt.
  - `this.disposeSignal`.
- **Framework-Fixes aus dem Tutorial** (port-findings J, N): u. a. `#private`-Lifecycle-Felder,
  `@attributes` ohne Capture, `@bind` bei range/date/leerer Zahl, `@ref` nach ChildContent,
  `EventCallback`-Typen, TS2869 in gemischten Attributen.
- **`pnpm -r test` unter Node 25 grün**: eigene vitest-Configs für cli/lsp/workspace,
  `node --test test/*.test.mjs` in den Apps.
- Gates zuletzt grün: `pnpm -r --filter '!fluentcms-admin' build` und `… test`.

## Neue Grundsatz-Dokumente (alle committed)

- `design-principles.md`:
  - „Why Tsazor“: Die Hauptzielgruppe sind .NET-Backend-Teams, die nur Blazor verlassen.
    Backend-Optionen bleiben offen, Sleipnir ist optional.
  - „Parity first, then scale“: v1 = Blazor-Parität mit Superset-Regel.
  - „Type safety is a requirement“: strict ist Pflicht, kein relaxed-Profil; daraus folgt das
    Stabilitätsversprechen.
- `roadmap-1.0.md`: Gesamtplan für 1.0. §4 Stabilität/Onboarding S1–S6, §5 Enterprise
  readiness E1–E12, §6 Release R1–R5, am Ende die Reihenfolge.
- `roadmap-tutorial.md`, `roadmap-sleipnir.md` (Entwurf, offene Entscheidungen),
  `roadmap-ssr.md` (**post-1.0**; entschieden: anhängen statt ersetzen, Islands, Node).
- Design-Entwürfe:
  - `design-svelte-features.md`:
    - F1a static markup ist eine Paritätslücke zu Razor (AddMarkupContent).
    - F2 `@attach`, F3 `<Await>`, F4 transitions, F5 `@animate`.
    - Offen: D1 (der `@`-Namensraum ist in Razor nicht frei, verifiziert mit .NET 10).
  - `design-extensions-primitives.md`:
    - `Decimal`, `TimeSpan`/`DateOnly`/`Guid`, `HttpClient` + Factory + Handler,
      `Logger<T>`, `Options<T>`.
    - Keine BCL-Klone. Offen: X1–X4.

## Branch `port/modulestore-fixes` — **gemergt** (`205b30a`, Hash-Routing-Namen vom User bestätigt; Gates danach grün)

Er entstand beim Port einer Business-SPA (Svelte 4, ca. 4k Zeilen, im iframe eingebettet).
Der Port selbst liegt **außerhalb dieses Repos** (Firmencode; Ort siehe private Notizen).
Commits:
- `918e451` **Hash-Routing als Opt-in** (E11): `createTsazorApp({ routing: { mode: "hash" } })`,
  `new NavigationManager({ mode: "hash" })`, `toLinkHref`. Dazu 19 Tests in
  `conformance/test/runtime/hash-routing.test.ts`.
- `2e0dfa3` `tsazor check` **ohne Pfad prüfte nichts** (Exit 0). Die Gates `tsazor check &&
  vite build` in pizza, demo, gallery und sleipnir-ticker waren deshalb wirkungslos. Jetzt wird
  das aktuelle Verzeichnis geprüft.
- `4a8863b` `tsazor check` prüft jetzt auch Code-behind und importierte `.ts`-Dateien. Dabei ist
  ein echter Fehler in `apps/blazing-pizza/src/models.ts` aufgefallen, behoben.
- `dccd930` Forms:
  - `EditForm` mit `EditContext`-Parameter baute bei jedem Re-Render neu.
  - `InputBase` schreibt das Model jetzt vor der Validierung.
- `d915ab9` port-findings, Abschnitte Q–U (allgemein formuliert).

Probe-Merge ohne Konflikte. Tests grün; ein Tutorial-Test („async-work app-b“) ist unter Last
flaky, einzeln läuft er grün.

Noch offen: Die Sicherheitsthemen im Port beheben oder originalgetreu lassen? Das betrifft den
Port, nicht dieses Repo. Der flaky Tutorial-Test „async-work app-b“ sollte robuster werden.

## Entscheidungen des Users (2026-10-02, nach dem Handoff)

- Der Port bleibt originalgetreu; die Sicherheitsfunde gehen als Liste an das Team.
- "The real traps" wird in zwei Lektionen aufgeteilt; tsconfig `lib` ES2023.
- D1: `@`-Namensraum reserviert · D2: `@attach` · D3: Svelte-Set · D4: **`@State` in v1**.
- X1: zwei Pakete · X2: `HttpClient`-Alias · X3: `toEven` · X4: **Mappings immer an**.
- Sleipnir: frischer Klon, Feature-Branch + PR · Emitter in `@tsazor/sleipnir` · vor dem Start
  ein Plan-Review.

## (Erledigt) Frühere offene Fragen an den User

- Tutorial: Sollen die langen C#-Lektionen („the-real-traps“, „structural-typing“) so bleiben,
  oder werden die Fallen auf zwei Lektionen aufgeteilt?
- Empfohlene `tsconfig` auf `lib: ES2023` anheben (für `toSorted`)? Ich empfehle ja.
- Design-Entscheidungen D1–D4 (Svelte-Features) und X1–X4 (Extensions).
- Sleipnir-Roadmap: Wo passiert die Upstream-Arbeit, und wo liegt der Emitter?

## Nächste Schritte (laut letztem Gesprächsstand)

0. ~~Kleine Aufgaben (entschieden): Lektion „The real traps“ in zwei teilen; empfohlene tsconfig
   `lib` auf ES2023~~ — **erledigt** (Commits `48645ed`, `475cec3`, 2026-10-02). Die Teilung:
   09-this-and-equality + 10-numbers-and-dates; alle Gates grün (Tutorial 375/375 + verify ALL PASS).
   Vor der Umsetzung von `@State` (D4) ein kurzes eigenes Design-Dokument (flach, keine Proxies,
   Zusammenspiel mit `observe()`/`@Bindable`) — **weiterhin offen**.
1. ~~**E8 Lokalisierung**~~ — **erledigt** (`475cec3`, 2026-10-02). Design-Doc
   `docs/design-localization.md` (D-L1..D-L7 entschieden wie empfohlen, Implementation-Notes in
   §10). Umgesetzt: `runtime/src/localization/` (CultureInfo/CultureService/StringLocalizer),
   Auto-Render über DI-Marker, `createTsazorApp({ localization })`, Validierungs-Meldungen über
   reservierte `tsazor.validation.*`-Keys, `@bind:culture` (nur Numbers — Dates bleiben ISO, s. §10),
   Compiler-Support, 28 Conformance-Tests, `@tsazor/testing`-Fixture `createFakeLocalization`,
   language-reference-Sektion. **Noch offen aus E8:** Part-3-Lokalisierungs-Lektion (M4+),
   E12-`Decimal`-Komposition mit `@bind:culture`.
2. Tutorial M4 (Teil 3 „Applications"):
   - **Routing-Kapitel erledigt** (Commit `dfa55fc`, 2026-10-02): 6 Lektionen
     `content/03-applications/01-routing/` (01-pages … 06-not-found, kumulativer App-Zustand,
     app-b wie üblich nur geänderte Dateien), Engine-Prerequisite **H.7 In-Memory-History**
     (`runtime/src/navigation/memory-history.ts` + Tests; Preview zeigt die URL im
     srcdoc-iframe), 18 Claims-Tests `test/claims-part3.test.ts` (Route-Manifest, Interception,
     `:int`-Konvertierung, Optional-segment-liefert-null — Blazor-Parität!, NavLink-Semantik
     inkl. `class=""` inaktiv + Prefix/All-Falle, TS2339 ohne Import, navigateTo,
     LocationChanged + registerLocationChangingHandler, Query-Parameter inkl. dokumentiertem
     Throw, NotFound).
   - **Forms-Kapitel erledigt** (2026-10-02): 6 Lektionen `content/03-applications/02-forms/`
     (01-edit-form … 06-attaching-a-file; die tote `/bread`-Route wird das Vorbestell-Formular),
     14 weitere Claims-Tests im selben File (EditForm-Submit-Routing inkl. OnSubmit-Throw,
     exakte Decorator-Meldungen, gestapelte Regeln, Summary/Status-Fluss, die vier
     Field-Klassen, Validators-Map sofortige Meldung + Koexistenz, InputFile inkl. Guards).
     Zwei echte Funde: **Blazor-Paritätslücke im Runtime gefixt** — `InputBase.fieldClass`
     liefert jetzt die vier dokumentierten Zustände `valid`/`invalid`/`modified valid`/
     `modified invalid` (`runtime/src/forms/input-base.ts`; fluent-Wrapper bleiben „still“ für
     unberührte Felder, indem sie auf `modified` schlüsseln). Und die **Auto-Import-Grenze war
     in den Lerntexten falsch beschrieben**: Markup-Tags importieren sich selbst — auch
     `DataAnnotationsValidator` und `InputFile`; nur Code-Namen (Decorators, `EditContext`,
     `ModelValidator`, `InputFileChangeEventArgs`) brauchen `@import`. Lerntexte und App-Dateien
     entsprechend korrigiert; der Claims-Test pinnt beide Seiten (Tag ohne Import baut+prüft+läuft,
     Decorator ohne Import → TS2552). Auch gefixt: 06/app-a führte den Stand von Lektion 05
     (Validators-Map) nicht mit — Kontinuitätsbruch.
     **Ton-Überarbeitung** (2026-10-02, danach): Routing + Forms auf den Stil von Kapitel 1
     zurückgeführt (Aufgabe zuerst, ein Konzept pro Lektion, eigener knapper Blazor-Track,
     Callouts ~50 Wörter); „Rules on the model“ geteilt → 7 Lektionen (03-validation-messages
     neu, 04–07 umnummeriert). Editor kann keine Dateien anlegen → Stub-Dateien in app-a
     (`Lost.tsazor`, `BreadOrder.ts`). Faktenfehler in Blazor-Callouts korrigiert
     (`Uri`/`BaseUri`/`ToBaseRelativePath`; Blazor hat kein `GetInvalidFields`). 455/455 grün,
     `scripts/verify.mjs` ALL PASS.
     Tutorial-Gesamt davor: 450/450 grün, `pnpm -r --filter '!fluentcms-admin' build` + `test`
     grün. **Wichtig:** Runtime-Dist nach `input-base.ts`-Änderungen rebuilden — das Tutorial
     testet gegen das gebaute Dist, nicht gegen src.
   - **Harness-Lektion:** ein failender Assert überspringt `dispose()` — die lebende App
     behält ihren document-weiten Click-Listener und schluckt die Klicks des nächsten
     Tests; Fix: `live: Mounted[]` + `afterEach`-Disposal (claims-part3.test.ts).
   **Offen in M4:** Auth (AuthorizeView), Talking to a backend, Testing, Next steps; die
   Lokalisierungs-Lektion (E8-Follow-up) und Hash-Routing evtl. als Lektion. Danach R1 CI +
   S1 API-Snapshot. Optional: Echte-Browser-Routing-Prüfung in `scripts/verify.mjs`
   (Deep-Link + URL-Bar nach Klick) — happy-dom kann das srcdoc-Memory-History-Verhalten
   nicht verifizieren.
3. Bundle-Analyse: erst vor dem Release-Kandidaten. Die Bundle-Größe ist laut User kein Blocker
   (+15 KB gz zum Svelte-Original, cachebar).

## Resume-Regeln

- Prüfen: `git status --short`, `git log --oneline -3`, `git worktree list`.
- **Nicht anfassen:** `pnpm-lock.yaml` (lokale Änderung des Users für `apps/fluentcms-admin`)
  und `apps/fluentcms-admin/` (lokales WIP des Users, untracked, Build scheitert an fehlendem
  `app.css`). Aus Gates ausschließen mit `--filter '!fluentcms-admin'`.
- Wenn ein Merge `pnpm-lock.yaml` ändert: User-Diff sichern, eindeutig benannten Stash anlegen,
  mergen, `pnpm install`, Inhalt mit dem gesicherten Diff vergleichen (ohne die Zeilen
  `index`/`@@`), Stash droppen.
- Merges nach `roadmap/phase-0` nur mit ausdrücklicher Freigabe des Users. Pushen nur auf
  ausdrückliche Bitte.
- **Firmencode bleibt draußen:** keine Inhalte, Namen oder URLs aus Firmen-Apps in dieses
  (öffentliche) Repo, auch nicht in Tests, Doku, Findings oder Commit-Messages.
- Gate-Reihenfolge: `pnpm install`, `pnpm -r build`, `pnpm install` (Bin-Links), dann Tests.
- Worktrees der gemergten Branches (`agent-*`, `p2-4` … `p5`) können aufgeräumt werden. Vorher
  den User fragen.
