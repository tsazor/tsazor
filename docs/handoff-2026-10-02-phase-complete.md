# Handoff — Phasen 2–5 abgeschlossen (Stand: 2026-10-02, VSIX-Reload ausstehend)

Session-Fortsetzungsdatei. Alles Relevantes steht hier und im Commits; ergänzend gilt
[handoff-lsp-v2.md](handoff-lsp-v2.md) (LSP/VSIX-Regeln, weiterhin gültig). Kurz vor dem Start:
**User startet VS Code neu** (Extension-Host-Reload), um `tsazor.tsazor-vscode@0.6.0` zu aktivieren
und das Codemod/Slots-Feature in der Praxis zu testen.

## Zustand

- **Remote:** `github.com/HolgerTheHuck/Tsazor` (privat, via `gh` angelegt, HTTPS). Gepusht ist nur
  `roadmap/phase-0` (= 8a85333, Default-Branch); `main` und die Quell-Branchen
  (`roadmap/p2-3-templates`, `p2-4-typed-checks`, `p2-5-lsp`, `p3-builtins`, `p4-devserver`,
  `p5-packaging`) sind nicht gepusht — alle mergiert, Quell-Branchen sind nur noch Historie.
- Gepushter Stand = **Phase 0–5 komplett**: Phase 2 (2.1–2.5: Parameter-Metadaten, templated
  components, typed shadows/`tsazor check`, LSP projektweit, Codemod), Phase 3 (3.1–3.8:
  Built-ins, EditForm-Semantik, Decorator-Validierung, InputFile/Query/`bind:format`, DI),
  Phase 4 (4.1 HMR/Invalidierung, 4.2 Fluent-Überarbeitung), Phase 5 (5.1 Paketierung/Tarball-Gate,
  5.2 `@tsazor/dotnet`).
- Gates am gepushten Stand: **1227/1227 Tests** (91 Dateien), Build grün, Tarball-Smoke-Gate
  (`node scripts/tarball-smoke.mjs`) grün, LSP-Smokes, App-E2E (Pizza 20/20 migriert, Gallery 53,
  Sleipnir, Demo inkl. `verify-hmr.mjs` 19/19), `tsazor check` 0 Befunde, Probe **157/217 sauber /
  182 nach Codemod** (Baseline-Delta dokumentiert in roadmap.md).
- **VSIX:** 0.6.0 gepackt (`packages/vscode/tsazor-vscode-0.6.0.vsix`) und installiert
  (`code --list-extensions` → `tsazor.tsazor-vscode@0.6.0`). Merge-Eintrag in roadmap.md unter
  VSIX 0.5.0/0.6.0.

## Lokale Zustände (untouchable / wichtig)

- **Haupt-Checkout hält User-Arbeit:** modifiziertes `pnpm-lock.yaml` + untracked
  `apps/fluentcms-admin/` — niemals committen, reverten oder anfassen. Workspace-Build
  scheitert nur an dieser App: `pnpm -r --filter '!fluentcms-admin' build`.
- **Gate-Reihenfolge nach Merges:** erst `pnpm -r --filter '!fluentcms-admin' build` (dist), dann
  `pnpm test` — sonst falsch-rote Erstläufe (stale dist/transform-Cache). `pnpm install
  --frozen-lockfile` nach Merges mit Package-Änderungen.
- **Worktrees** `.claude/worktrees/{agent-a7e2…,p2-4,p2-5,p3,p4,p5}`: alle sauber und mergiert —
  Kandidaten für Aufräumen (`git worktree remove`), erst nach User-OK.
- Merge mit lokaler Lock: stash → merge → pop (mehrfach sauber); wenn der Branch die Lock nicht
  berührt, geht es ohne Stash.
- Windows: `npx tsazor` ist kaputt — `node packages/cli/dist/bin.js` nutzen. vsce muss in
  `packages/vscode/` laufen, nicht im Repo-Root.

## Offene Punkte

1. **FluentCMS-Admin-Seitenports** (echter Phase-3-Messpunkt): der User baut `apps/fluentcms-admin`
   lokal; Zusammenarbeit koordinieren, sobald erste `.razor`-Dateien da sind. Die Feature-Basis
   steht: Validierung (3.6 Decorators), Query (3.7), DataGrid (4.2), `@tsazor/dotnet` mit
   `--envelope data,errors` (5.2). Codemod-Einstieg: `node packages/cli/dist/bin.js codemod
   <dir> [--write]`; Probe-Rest: TZS024 ×35 nicht-mechanische C#-Formen, TZS005 ×31.
2. **Sleipnir nicht auf `@tsazor/dotnet` migriert** — Batch/WS/SSE ist kein REST/ProblemDetails
   (bewusst, dokumentiert). Eine WS/SSE-Erweiterung der Brücke wäre Phase-5-Folgearbeit, wenn
   gefragt.
3. **CI:** das Tarball-Gate ist als CI-Vorstellung gedacht, es existiert noch kein CI (GitHub
   Actions-Workflow fehlt). Kandidat fürs nächste Gespräch.
4. **VSIX-Nächstes:** Codemod-Regeln/Slots-Feature aus dem Praxistest des Users einspannen; ggf.
   Push von `main`/Default-Branch-Umbenennung (User-Frage offen).
5. Dokumentierte Deviations nicht verlieren: Render-Queue parent-first, `Router.NotFound` (statt
   `NotFoundPage`), native `File` statt `IBrowserFile`, JWT ohne Signaturprüfung, Inline-Objekte ⇒
   `Record<string, unknown>` (Warnung), Fluent `--invalid` live pro Edit — jeweils in roadmap.md/
   architecture.md mit Begründung verzeichnet.

## Resume-Regeln für die nächste Claude-Session

- `git status --short` + `git log --oneline -3` + `git worktree list` prüfen; Memory
  (`handoff-2-3-merged.md`) lesen — sie ist die Kurzfassung dieses Dokuments.
- User-Freigaben am 2026-10-01/02: autonomer Betrieb über die Phasen hindurch, Commits und Merges
  bei grünen Gates frei. Merges in `roadmap/phase-0` sind seitdem freigegeben ("Okay für commit und
  merge"); Push brauchte eine eigene Bestätigung und wurde geleistet.
- Phasen-Agenten kamen je im eigenen Worktree `.claude/worktrees/pN` ab `roadmap/phase-0`:
  Briefing = Roadmap-Abschnitt + Regeln + Gates + "review WIP first" bei Resume.