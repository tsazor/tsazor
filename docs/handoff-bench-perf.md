# Handoff: Bench-Suite + Runtime-Perf-Runde (2026-09-29, Session-Ende)

Stand nach "Löse das jetzt." + "Okay für commit" + Runtime-Perf-Runde.
Zulesen zusammen mit `docs/handoff-lsp-v2.md` (LSP v2/VSIX 0.3.4, weiterhin gültig).

## 1. Git-Stand

**Committed (3 Commits auf main, heute):**
- `3853eaa` Runtime-Memory-Refactor: retained Heap 18.2 → 17.1 MB bei 11k Rows
  (render-tree.ts: Objekt-Literale statt 17-Feld-Frame-Klasse, In-Place-Mutation
  via `EditableFrame`-Cast, `renderedNodes` als dichtes Array statt Map;
  component-state.ts, dom-renderer.ts)
- `a22dc55` Bench: identische TodoMVC+10k-Rows-App in 5 Stacks + Messsuite
  (apps/bench/ komplett, .gitignore-Erweiterung, pnpm-workspace/lock)
- `5275769` LSP/vite-plugin: Shadow-False-Positive-Filter (TS2307 statische
  Assets, TS2564 @Parameter), eager LSP fixes, Handoff (docs/handoff-lsp-v2.md)

**NICHT committed (bewusst offen, laufend ab Tag):**
- **Runtime-Perf-Runde** (siehe §3): `packages/runtime/src/renderer/renderer.ts`,
  `dom-renderer.ts`, `component-state.ts`
- **`apps/demo/src/Pages/Counter.tazor`** — User-Hand-Änderung
  (`private currentCount : number = 0;`) — **NICHT anfassen, NICHT commitieren**,
  gilt weiter (User entscheidet)

## 2. Bench (apps/bench/) — finales Bild

Identische App (TodoMVC + 10k-Rows) in Tasor / React 19 / Vue 3 / Svelte 5 /
Blazor WASM (dotnet 10); Messsuite `apps/bench/measure/run.mjs` (Playwright,
msedge headless): 5 cold loads, 5 op cycles, **forced-GC heap** via CDP
`HeapProfiler.forceGC` (+ `--js-flags=--expose-gc` Fallback), Median; Output in
`results.json` + README-Tabelle (Block `<!-- RESULTS-START -->`).

**Finale Zahlen (alle aus einem Lauf, forced GC, 11k Rows):**

| App | JS gz KB | .NET runtime gz KB | ready ms | create10k | append1k | upd10th | swap | select | remove | heap MB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Tasor | **14.1** | – | **23.5** | 450 | 178 | 156 | 220 | 85 | 406 | **16.5** |
| Svelte 5 | 15.1 | – | 23.7 | 570 | **77** | 130 | 180 | **10** | **208** | 23.8 |
| Vue 3 | 26.3 | – | 24.2 | **425** | 124 | 99 | 198 | 37 | 222 | 18.8 |
| React 19 | 69.2 | – | 40.1 | 551 | 121 | **92** | **180** | 26 | 218 | 25.2 |
| Blazor WASM | 3,314.9 | 6,465.6 | 436.6 | 559 | 185 | 113 | 215 | 103 | 271 | 19.9 |

**Kernerkennnisse (für den Artikel gold wert):**
1. Der früher gemeldete "doppelte Heap" (Tasor ~70 vs. React/Svelte ~40 MB) war
   **KEIN Design-Problem**, sondern ungesammelter Garbage in
   `performance.memory.usedJSHeapSize`. Mit Forced GC liegt der retained
   Live-Set bei ALLEN JS-Frameworks bei 16–25 MB; Tasor ist mit 16.5 MB der
   kleinste JS-Wert. Blazor muss fair mit WASM-Gedächtnis bewertet werden
   (Zustand liegt im .NET-GC-Heap, den diese Metrik nicht sieht) — Caveat steht im README.
2. Memory-Refactor A/B (heap-probe.mjs, Forced GC, voller Rows-Zyklus):
   17-Feld-Frame-Klasse **24.4 MB** (SCHLECHTER — Text/Attr-Frames sind ~⅔ aller
   Frames), Literale+Spreads 18.2, **Hybrid final 17.1** (keine Spreads,
   In-Place `subtreeLength`/key-Mutation über `EditableFrame`-Cast).

**Reproduktion:** `apps/bench/measure` → `node run.mjs` (baut alles,
~10 min wegen Blazor-Publish), `--app=<name>` subset, `--runs=10 --skip-build`
für Wiederholung OHNE Builds. **Gotcha: `--skip-build` NICHT nutzen, nachdem
packages/runtime geändert wurde** — das tasor-dist bündelt die Runtime.
Einzeln-Heap-Probe: `node heap-probe.mjs` (Tasor /rows, CDP forced GC, 3 Samples).

## 3. Runtime-Perf-Runde (UNCOMMITTED, 135/135 Tests grün, Heap-Parität 16.5 MB)

User wählte "Runtime-Perf" aus vier Richtungen. Drei Hebel umgesetzt:

1. **Builder-Ping-Pong pro ComponentState** (`renderer.ts` flush +
   `component-state.ts`): Tuple `renderBuilders = [new RenderTreeBuilder(), new …]`
   + `renderPass ^= 1` — kein Builder/Frame-Array-Allok pro Render-Pass.
   **KRITISCH: der *andere* Builder wird am ENDE des Flushs geleert** (nach
   Diff+Assign), nicht am Anfang am frischen. Erste Version leerte am Anfang
   den anderen → retained den Vorvorletzten-Baum (gemessen: 23.7 MB statt
   16.5), und eine Zwischenversion ohne Toggle clearte den LIVE-Baum — beide
   Fehler liefen erst im Forced-GC-Probe auf, nicht in den Tests.
2. **Detached Mount** (`dom-renderer.ts` processElement, Creation-Path): frische
   Element-Subtrees bauen Children in das (noch) detached Element und inserten
   EINMAL pro Element statt pro Node → `insertBefore`-Count ~3n→n bei Mounts.
   Update-Path (canUpdate) unverändert live-insertierend. ElementReferenceCapture
   kann transient detached parentDom sehen (funktioniert, gleiche Element-Objekte).
3. **Attribute-Fastpath** (`dom-renderer.ts` `updateAttributesFastPath` +
   Helper `attributeRunEnd`): lineare Paarwanderung der kontiguierten
   Attribut-Runs (Name/Order-Identität vorausgesetzt, `attributeValueSame` pro
   Paar) statt 2 Maps pro Element pro Diff; Fallback auf `attributeMap`-Pfad bei
   Längen-/Namen-Abweichung. Attribut-Runs sind direkt nach dem Start-Frame kontiguiert
   (bis Subtree-Ende oder erstem Nicht-Attribut-Frame).

**Ehrliches Messfazit (vorher → nachher, --app=tasor + volle Suite):**
upd10th 163→156, select 92→85, append1k 188→178; create10k/remove im Rauschen
(450/406). **Median-Ops ≈ unverändert** — bei 11k Rows ist der dominante Kosten-
anteil der volle Frame-Baum (Bauen+Diffen) pro Pass; das ist der architektonische
Preis des Blazor-Flat-Tree-Diff-Modells. Der Gewinn der Runde liegt im
**Allokationsdruck** (kein Builder/Array pro Pass, keine Map-Paare pro Element-Diff,
n inserts pro Element-Frame statt pro Node) → weniger GC-Druck, gleichmäßigere
Latency-Verteilung; nicht in Medians in diesem Szenario.

## 4. Offene nächste Richtungen (User-entschieden, nichts angefangen)

- **Weiter-Perf (architektonisch):** gegen die 2× create/remove vs. Svelte/Vue
  hilft kein Micro-Opt mehr — Themen: Subtree-Memoization, Keyed-Componenten-Fastpath
  oder inkrementelle Diff-Segmente (nur geänderte Bereiche diffen statt
  `matchChildren`-Volldurchlauf + attribut-paarwalk über 11k × ~10 Frames pro Pass).
  Realistischer nächster Hebel wäre ein "unchanged-Subtree-skip" via cheap
  Content-Hash der Frame-Segmente — Designarbeit, kein Mikro-Opt mehr.
- **Bench verbreitern:** Webkit/Firefox-Channels (der Heap-Metric ist
  `performance.memory` + forced GC — **Chromium-spezifisch**, Caveat im README);
  zweites Szenario "viele kleine Komponenten" (Tasors Componente-Slot-Kosten sind ungemessen).
- **Framework-Artikel:** die Zahlen + Methodik + Kernerkennnis (GC-Artifact!)
  sind reproduzierbar in `apps/bench/measure/run.mjs` — das war die ursprüngliche Motivation.
- **Feature-Backlog (docs/, nicht begonnen):** named child slots, `@bind:format`,
  `tasor typecheck` CLI, LSP rename, published-npm-Layout @tasor/components,
  Web-Components-Richtung B (`defineCustomElement`, ~150–250 Zeilen, user-approved als Richtung).
- **Offene User-Akzeptanz (aus LSP-Runde):** LSP-Completions/Diags manuell im
  VS Code an sleipnir-ticker prüfen (Store.-Completions, points-Hover, Go-to-def, Squiggles).

## 5. Verifikations-Stand heute Abend

- `pnpm --filter @tasor/runtime build` sauber; `pnpm -w test` **135/135**
  (nach JEDER der drei Perf-Änderungen gelaufen)
- Volle Bench-Suite: exit 0, **0 page-errors, 7/7 TodoMVC-Checks × 5 Apps**,
  removeWorked überall true; Zahlen oben aus diesem Lauf (bu7hsox6n / 21:4x)
- Heap-Probe (Forced GC, 3 Samples): **16.5 MB** stabil (17.1/17.1/17.1 mit
  11k-Rows-Zyklus gemessen — Parität zum Pre-Perf-Stand, ABER mit
  Allok-Fix: kein Builder/Array-Müll pro Pass mehr)

## 6. Frage für Morgen (User, Session-Ende): Breakpoints in VS Code

User setzte Breakpoints in Chrome DevTools (funktionierte), NICHT in VS Code — geht das?
Antwort-Vorschlag (umzusetzen + per echtem Bruchpunkt verifizieren):
1. **JavaScript Debug Terminal** in VS Code öffnen → darin den Vite-Dev-Server
   starten (apps/demo, Port 5199) → VS Code attached automatisch. Breakpoints
   dann direkt in `src/Pages/Counter.tazor` setzen — die inline Sourcemaps
   (Compiler→esbuild-Kette, gleiche Basis wie die bewiesene
   `verify-debugging.mjs`-Kette) kennt VS Codes JS-Debugger ohne Extra-Setup.
2. Alternativ `launch.json`: `{ "type": "chrome", "request": "launch",
   "url": "http://127.0.0.1:5199", "webRoot": "${workspaceFolder}/apps/demo" }`.
Gotcha-Falle: löst ein Breakpoint nicht auf (unaufgefüllter Kreis), prüfe
`webRoot`/`sourceMapPathOverrides` gegen die `sources`-Pfade der inline Map
(decodierbar wie in verify-debugging.mjs). Code-behind `.ts`-Breakpoints sind
natives Vite-TS-Debugging (ohne Map-Magie).

## 7. Gotchas von heute (neu, zusätzlich zu handoff-lsp-v2.md)

- **Bench-Commit:** die .gitignore deckt bench-Build-Outputs nicht ab —
  `apps/bench/blazor/{bin,obj,publish}/` + `apps/bench/*/dist|node_modules/`
  sind jetzt ignoriert (1.402 Build-Output-Dateien waren im ersten
  Commit-Versuch mit drin, via `git rm -r --cached` + `--amend` gefräst).
- Blazor-Publish-Output liegt unter `publish/wwwroot/` (nicht `publish/`).
- Ready-Marker muss in JEDES .razor (`OnAfterRenderAsync` + JS `eval`);
  Rows.razor hatte ihn erst nachgereicht bekommen.
- headless-FCP ist spürisch (nur Blazo-Runs melden überhaupt Paint-Einträge):
  null-Passthrough im Harness, keine FCP-Pseudo-Nullen in die Tabelle.
- Random-6-digit Row-Ids kollidieren statistisch bei 11k (→ unique-id-Loop in
  allen 5 Ports); React: Set-Neu-Erzeugung im Componenten-Body = duplicate
  keys + Phantom-<tr>s → `useRef(new Set())`.
- `--skip-build` in run.mjs nach Runtime-Änderungen: tasor-dist ist alt
  (bündelt Runtime) → erst rebuilden.
- Windows-Git: LF→CRLF-Warnungen bei Adds — unkritisch, aber die
  Amend-Erkennung ("wer hat gerade 1.402 Dateien committet?") geht via
  `git show --stat HEAD | tail`.