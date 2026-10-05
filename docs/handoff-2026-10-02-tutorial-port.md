# Handoff: tutorial, extensions, business SPA port (status 2026-10-02, restart)

Session goal after phases 2–5: English docs, interactive tutorial, Tsazor extensions,
sharpening the profile and a first real port of a company SPA. **Read first:** this document,
then [roadmap-1.0.md](roadmap-1.0.md) as the overall overview.

## State of `roadmap/phase-0` (HEAD after this handoff commit; more than 40 commits ahead of `origin`, not pushed)

Merged in this session:
- **`docs/english`**: user docs in English and brought up to date. Internal
  documents (roadmap*, handoffs, reviews, port-findings, design-2.4) stayed German at that point.
- **Tutorial `apps/tutorial`** (`pnpm --filter tutorial dev`, :5330):
  - Svelte style: text on the left, editor (CodeMirror) on the right with a live preview in a sandboxed iframe.
  - The compiler and `tsazor check` run in the browser (web worker).
  - Two tracks: **TS = main track**, Blazor = "you know this, here is what's different".
  - M1 and M2 cover part 1 (chapters 1–7), M3 part 2 (chapters 8–13).
  - Plus, in the Blazor track, the chapter "TypeScript for C# developers" (9 lessons) and the
    cheat sheet `docs/csharp-to-typescript.md`.
  - Gates: `pnpm --filter tutorial test` (lesson gate and claims tests) and
    `pnpm --filter tutorial verify` (E2E in Edge).
- **Tsazor extensions** ([design-bindable-observe.md](design-bindable-observe.md)):
  - `@Bindable() accessor value` with diagnostic TZS030.
  - `this.observe(source)`; the name was `track` at first and was renamed because of name
    collisions.
  - `this.disposeSignal`.
- **Framework fixes from the tutorial** (port-findings J, N): among others `#private` lifecycle fields,
  `@attributes` without capture, `@bind` on range/date/empty number, `@ref` after ChildContent,
  `EventCallback` types, TS2869 in mixed attributes.
- **`pnpm -r test` green under Node 25**: own vitest configs for cli/lsp/workspace,
  `node --test test/*.test.mjs` in the apps.
- Gates last green: `pnpm -r --filter '!fluentcms-admin' build` and `… test`.

## New foundational documents (all committed)

- `design-principles.md`:
  - "Why Tsazor": the main target group is .NET backend teams that are leaving only Blazor.
    Backend options stay open, Sleipnir is optional.
  - "Parity first, then scale": v1 = Blazor parity with the superset rule.
  - "Type safety is a requirement": strict is mandatory, no relaxed profile; the
    stability promise follows from that.
- `roadmap-1.0.md`: overall plan for 1.0. §4 stability/onboarding S1–S6, §5 enterprise
  readiness E1–E12, §6 release R1–R5, the order at the end.
- `roadmap-tutorial.md`, `roadmap-sleipnir.md` (draft, open decisions),
  `roadmap-ssr.md` (**post-1.0**; decided: append instead of replace, islands, Node).
- Design drafts:
  - `design-svelte-features.md`:
    - F1a static markup is a parity gap to Razor (AddMarkupContent).
    - F2 `@attach`, F3 `<Await>`, F4 transitions, F5 `@animate`.
    - Open: D1 (the `@` namespace is not free in Razor, verified with .NET 10).
  - `design-extensions-primitives.md`:
    - `Decimal`, `TimeSpan`/`DateOnly`/`Guid`, `HttpClient` + factory + handler,
      `Logger<T>`, `Options<T>`.
    - No BCL clones. Open: X1–X4.

## Branch `port/modulestore-fixes` — **merged** (`205b30a`, hash routing names confirmed by the user; gates green afterwards)

It came out of porting a business SPA (Svelte 4, about 4k lines, embedded in an iframe).
The port itself lives **outside this repo** (company code; location see private notes).
Commits:
- `918e451` **hash routing as opt-in** (E11): `createTsazorApp({ routing: { mode: "hash" } })`,
  `new NavigationManager({ mode: "hash" })`, `toLinkHref`. Plus 19 tests in
  `conformance/test/runtime/hash-routing.test.ts`.
- `2e0dfa3` `tsazor check` **without a path checked nothing** (exit 0). The gates `tsazor check &&
  vite build` in pizza, demo, gallery and sleipnir-ticker were therefore ineffective. Now
  the current directory is checked.
- `4a8863b` `tsazor check` now also checks code-behind and imported `.ts` files. This
  surfaced a real error in `apps/blazing-pizza/src/models.ts`, fixed.
- `dccd930` Forms:
  - `EditForm` with an `EditContext` parameter rebuilt on every re-render.
  - `InputBase` now writes the model before validation.
- `d915ab9` port-findings, sections Q–U (phrased generically).

Trial merge without conflicts. Tests green; one tutorial test ("async-work app-b") is flaky under
load, it passes when run alone.

Still open: fix the security issues in the port or leave them true to the original? That concerns the
port, not this repo. The flaky tutorial test "async-work app-b" should become more robust.

## The user's decisions (2026-10-02, after the handoff)

- The port stays true to the original; the security findings go to the team as a list.
- "The real traps" is split into two lessons; tsconfig `lib` ES2023.
- D1: `@` namespace reserved · D2: `@attach` · D3: Svelte set · D4: **`@State` in v1**.
- X1: two packages · X2: `HttpClient` alias · X3: `toEven` · X4: **mappings always on**.
- Sleipnir: fresh clone, feature branch + PR · emitter in `@tsazor/sleipnir` · a plan review
  before starting.

## (Done) Earlier open questions to the user

- Tutorial: should the long C# lessons ("the-real-traps", "structural-typing") stay as they are,
  or should the traps be split into two lessons?
- Raise the recommended `tsconfig` to `lib: ES2023` (for `toSorted`)? I recommend yes.
- Design decisions D1–D4 (Svelte features) and X1–X4 (extensions).
- Sleipnir roadmap: where does the upstream work happen, and where does the emitter live?

## Next steps (as of the last conversation)

0. ~~Small tasks (decided): split the lesson "The real traps" in two; recommended tsconfig
   `lib` to ES2023~~ — **done** (commits `48645ed`, `475cec3`, 2026-10-02). The split:
   09-this-and-equality + 10-numbers-and-dates; all gates green (tutorial 375/375 + verify ALL PASS).
   Before implementing `@State` (D4), a short design document of its own (flat, no proxies,
   interplay with `observe()`/`@Bindable`) — **still open**.
1. ~~**E8 localization**~~ — **done** (`475cec3`, 2026-10-02). Design doc
   `docs/design-localization.md` (D-L1..D-L7 decided as recommended, implementation notes in
   §10). Implemented: `runtime/src/localization/` (CultureInfo/CultureService/StringLocalizer),
   auto-render via DI marker, `createTsazorApp({ localization })`, validation messages via
   reserved `tsazor.validation.*` keys, `@bind:culture` (numbers only — dates stay ISO, see §10),
   compiler support, 28 conformance tests, `@tsazor/testing` fixture `createFakeLocalization`,
   language-reference section. **Still open from E8:** part 3 localization lesson (M4+),
   E12 `Decimal` composition with `@bind:culture`.
2. Tutorial M4 (part 3 "Applications"):
   - **Routing chapter done** (commit `dfa55fc`, 2026-10-02): 6 lessons
     `content/03-applications/01-routing/` (01-pages … 06-not-found, cumulative app state,
     app-b as usual only changed files), engine prerequisite **H.7 in-memory history**
     (`runtime/src/navigation/memory-history.ts` + tests; the preview shows the URL in the
     srcdoc iframe), 18 claims tests `test/claims-part3.test.ts` (route manifest, interception,
     `:int` conversion, optional segment yields null — Blazor parity!, NavLink semantics
     incl. `class=""` inactive + Prefix/All trap, TS2339 without import, navigateTo,
     LocationChanged + registerLocationChangingHandler, query parameters incl. documented
     throw, NotFound).
   - **Forms chapter done** (2026-10-02): 6 lessons `content/03-applications/02-forms/`
     (01-edit-form … 06-attaching-a-file; the dead `/bread` route becomes the pre-order form),
     14 more claims tests in the same file (EditForm submit routing incl. OnSubmit throw,
     exact decorator messages, stacked rules, summary/status flow, the four
     field classes, validators map immediate message + coexistence, InputFile incl. guards).
     Two real findings: **Blazor parity gap in the runtime fixed** — `InputBase.fieldClass`
     now yields the four documented states `valid`/`invalid`/`modified valid`/
     `modified invalid` (`runtime/src/forms/input-base.ts`; fluent wrappers stay "quiet" for
     untouched fields by keying on `modified`). And the **auto-import boundary was
     described wrongly in the lesson texts**: markup tags import themselves — including
     `DataAnnotationsValidator` and `InputFile`; only code names (decorators, `EditContext`,
     `ModelValidator`, `InputFileChangeEventArgs`) need `@import`. Lesson texts and app files
     corrected accordingly; the claims test pins both sides (tag without import builds+checks+runs,
     decorator without import → TS2552). Also fixed: 06/app-a did not carry over the state of lesson 05
     (validators map) — a continuity break.
     **Tone rework** (2026-10-02, afterwards): routing + forms brought back to the style of chapter 1
     (task first, one concept per lesson, own concise Blazor track,
     callouts ~50 words); "Rules on the model" split → 7 lessons (03-validation-messages
     new, 04–07 renumbered). The editor cannot create files → stub files in app-a
     (`Lost.tsazor`, `BreadOrder.ts`). Factual errors in Blazor callouts corrected
     (`Uri`/`BaseUri`/`ToBaseRelativePath`; Blazor has no `GetInvalidFields`). 455/455 green,
     `scripts/verify.mjs` ALL PASS.
     Tutorial total before that: 450/450 green, `pnpm -r --filter '!fluentcms-admin' build` + `test`
     green. **Important:** rebuild the runtime dist after `input-base.ts` changes — the tutorial
     tests against the built dist, not against src.
   - **Harness lesson:** a failing assert skips `dispose()` — the live app
     keeps its document-wide click listener and swallows the clicks of the next
     test; fix: `live: Mounted[]` + `afterEach` disposal (claims-part3.test.ts).
   **Open in M4:** Auth (AuthorizeView), Talking to a backend, Testing, Next steps; the
   localization lesson (E8 follow-up) and possibly hash routing as a lesson. After that R1 CI +
   S1 API snapshot. Optional: a real-browser routing check in `scripts/verify.mjs`
   (deep link + URL bar after a click) — happy-dom cannot verify the srcdoc memory history behavior.
3. Bundle analysis: only before the release candidate. According to the user, bundle size is not a blocker
   (+15 KB gz compared to the Svelte original, cacheable).

## Resume rules

- Check: `git status --short`, `git log --oneline -3`, `git worktree list`.
- **Do not touch:** `pnpm-lock.yaml` (the user's local change for `apps/fluentcms-admin`)
  and `apps/fluentcms-admin/` (the user's local WIP, untracked, the build fails due to a missing
  `app.css`). Exclude from gates with `--filter '!fluentcms-admin'`.
- If a merge changes `pnpm-lock.yaml`: save the user's diff, create a uniquely named stash,
  merge, `pnpm install`, compare the content with the saved diff (without the
  `index`/`@@` lines), drop the stash.
- Merges into `roadmap/phase-0` only with the user's explicit approval. Push only on
  explicit request.
- **Company code stays out:** no content, names or URLs from company apps in this
  (public) repo, not in tests, docs, findings or commit messages either.
- Gate order: `pnpm install`, `pnpm -r build`, `pnpm install` (bin links), then tests.
- Worktrees of the merged branches (`agent-*`, `p2-4` … `p5`) can be cleaned up. Ask
  the user first.
