# Handoff — phases 2–5 complete (status: 2026-10-02, VSIX reload pending)

Session continuation file. Everything relevant is here and in the commits; in addition,
[handoff-lsp-v2.md](handoff-lsp-v2.md) applies (LSP/VSIX rules, still valid). Just before starting:
**the user restarts VS Code** (extension host reload) to activate `tsazor.tsazor-vscode@0.6.0`
and to try out the codemod/slots feature in practice.

## State

- **Remote:** `github.com/HolgerTheHuck/Tsazor` (private, created via `gh`, HTTPS). Only
  `roadmap/phase-0` is pushed (= 8a85333, default branch); `main` and the source branches
  (`roadmap/p2-3-templates`, `p2-4-typed-checks`, `p2-5-lsp`, `p3-builtins`, `p4-devserver`,
  `p5-packaging`) are not pushed — all merged, the source branches are just history now.
- Pushed state = **phases 0–5 complete**: phase 2 (2.1–2.5: parameter metadata, templated
  components, typed shadows/`tsazor check`, project-wide LSP, codemod), phase 3 (3.1–3.8:
  built-ins, EditForm semantics, decorator validation, InputFile/Query/`bind:format`, DI),
  phase 4 (4.1 HMR/invalidation, 4.2 Fluent rework), phase 5 (5.1 packaging/tarball gate,
  5.2 `@tsazor/dotnet`).
- Gates on the pushed state: **1227/1227 tests** (91 files), build green, tarball smoke gate
  (`node scripts/tarball-smoke.mjs`) green, LSP smokes, app E2E (Pizza 20/20 migrated, Gallery 53,
  Sleipnir, demo incl. `verify-hmr.mjs` 19/19), `tsazor check` 0 findings, probe **157/217 clean /
  182 after codemod** (baseline delta documented in roadmap.md).
- **VSIX:** 0.6.0 packaged (`packages/vscode/tsazor-vscode-0.6.0.vsix`) and installed
  (`code --list-extensions` → `tsazor.tsazor-vscode@0.6.0`). Merge entry in roadmap.md under
  VSIX 0.5.0/0.6.0.

## Local state (untouchable / important)

- **The main checkout holds user work:** modified `pnpm-lock.yaml` + untracked
  `apps/fluentcms-admin/` — never commit, revert or touch them. The workspace build
  fails only because of this app: `pnpm -r --filter '!fluentcms-admin' build`.
- **Gate order after merges:** first `pnpm -r --filter '!fluentcms-admin' build` (dist), then
  `pnpm test` — otherwise false-red first runs (stale dist/transform cache). `pnpm install
  --frozen-lockfile` after merges with package changes.
- **Worktrees** `.claude/worktrees/{agent-a7e2…,p2-4,p2-5,p3,p4,p5}`: all clean and merged —
  candidates for cleanup (`git worktree remove`), only after the user's OK.
- Merging with the local lock: stash → merge → pop (cleanly, several times); if the branch does not
  touch the lock, it works without a stash.
- Windows: `npx tsazor` is broken — use `node packages/cli/dist/bin.js`. vsce must run in
  `packages/vscode/`, not in the repo root.

## Open items

1. **FluentCMS admin page ports** (the real phase 3 measuring point): the user builds `apps/fluentcms-admin`
   locally; coordinate collaboration as soon as the first `.razor` files are there. The feature base
   is in place: validation (3.6 decorators), Query (3.7), DataGrid (4.2), `@tsazor/dotnet` with
   `--envelope data,errors` (5.2). Codemod entry point: `node packages/cli/dist/bin.js codemod
   <dir> [--write]`; probe remainder: TZS024 ×35 non-mechanical C# forms, TZS005 ×31.
2. **Sleipnir not migrated to `@tsazor/dotnet`** — batch/WS/SSE is not REST/ProblemDetails
   (deliberate, documented). A WS/SSE extension of the bridge would be phase 5 follow-up work, if
   asked for.
3. **CI:** the tarball gate is meant as a CI concept, no CI exists yet (GitHub
   Actions workflow missing). Candidate for the next conversation.
4. **VSIX next:** fold in codemod rules/slots feature from the user's practical test; possibly
   push `main`/rename the default branch (user question open).
5. Do not lose the documented deviations: render queue parent-first, `Router.NotFound` (instead of
   `NotFoundPage`), native `File` instead of `IBrowserFile`, JWT without signature verification, inline objects ⇒
   `Record<string, unknown>` (warning), Fluent `--invalid` live per edit — each recorded in roadmap.md/
   architecture.md with a rationale.

## Resume rules for the next Claude session

- Check `git status --short` + `git log --oneline -3` + `git worktree list`; read the memory
  (`handoff-2-3-merged.md`) — it is the short version of this document.
- User approvals on 2026-10-01/02: autonomous operation across the phases, commits and merges
  free when gates are green. Merges into `roadmap/phase-0` have been approved since then ("Okay for commit and
  merge"); push needed its own confirmation and was done.
- Phase agents each ran in their own worktree `.claude/worktrees/pN` off `roadmap/phase-0`:
  briefing = roadmap section + rules + gates + "review WIP first" on resume.
