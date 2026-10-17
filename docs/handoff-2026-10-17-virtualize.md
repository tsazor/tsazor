# Handoff: the extended-layer gates, the virtualize fixes and X9 (2026-10-17)

**Read first:** this document, then the findings table in [design-extended-library.md](design-extended-library.md) (§8, X1–X9).
The earlier state is in [handoff-2026-10-14-api-review.md](handoff-2026-10-14-api-review.md); the extended library itself in
[design-extended-library.md](design-extended-library.md) (§5: clusters 1–6 and the showcase shipped; §8: X1–X5).
Branch `roadmap/phase-0`, pushed through `3e418ba` (X9 and this handoff included). The review of this session's
work, later the same day, is the last section.

## Done in this session, in one table

| Item | Commit | Where it lives |
|---|---|---|
| Spreadsheet, cluster 7 first spike: the headless sheet model (cells in A1, ranges, undo stack, copy/paste), 6 tests | `ba393f1` | `packages/spreadsheet` |
| Gallery verifies never mount a foreign app — always their own vite on the first free port (a foreign app on the port held `networkidle` forever) | `f0899db` | `apps/gallery/scripts/verify*.mjs` |
| DataGrid's reorder grip keeps its 24px tap target under the squeezed header row (`flex: none`) — the axe target-size fix | `1acb5ec` | both skins' `DataGrid.tsazor.css` |
| **X6**: the parity jump helpers read decorative grid-header icons as spacers — spacers now matched by `aria-hidden` **with** a `style` attribute | `6812108` | `apps/blazor-parity/tests/virtualize/_helpers.mjs` |
| **X7 (runtime fix)**: Home while the End convergence still runs — fixed, see below | `e48f7f9` | `packages/runtime/src/data/virtualize-viewport.ts` |
| The provider-expansion and Home-while-converging tests sample and print their scroll trajectory on failure | `a2695be` | `tests/virtualize/{b-items-provider,i-home-end}.mjs` |
| X6–X8 in the findings table | `4e169b9` + `a75e1f2` | `docs/design-extended-library.md` |
| **X9 (cli fix)**: a library build's `.ts` helpers left stage-3 decorators raw — fixed, see below | `66833d7` | `packages/cli/src/build-library.ts` |

## X7 — Home/End while converging (fixed)

The owner-facing behavior (Tsazor deviation A12): pressing Home *while the End key's convergence to the bottom still
runs* must land at the top. The E2E test failed **3 full suite runs in a row** (standalone: pass) and the trajectory
showed the cause: the real End key's **UA smooth scroll keeps animating**; its later frames arrive after the synthetic
Home and count as a user scroll (the A16 rule), which ends the top convergence the Home just started — the list stays
at the bottom.

Fix: the jump keys own their jump —
- `preventDefault` on Home/End keydown (the UA's smooth key scroll is not wanted; it would end the very convergence
  the key started),
- the handler starts the jump itself: an instant `setScrollTop(scrollHeight/0)` plus `startConvergenceObserving`; the
  spacers' IntersectionObserver reports follow from that scroll event, so a synthetic Home works too.

Verified: 527 runtime unit tests green; full virtualize suites pass since (Edge, fluent and bootstrap).

## X8 — the provider-expansion re-point (open, with evidence)

`CanExpandDataSetAndRetainScrollPosition` (Blazor's own E2E) fails in ~1 of 4 parity suite runs. The test's semantics:
the scroll position is preserved **as a pixel count** when the provider's data set grows. The instrumentation (samples
every 250 ms; timeline printed on failure) captured the mechanism end to end:

1. The test scrolls to the **50-based end** of the 1,000-item list (`ItemSize` default 50). At that end window both
   spacers sits outside the 200px view ⇒ no spacer reports fire ⇒ the item size never recalibrates ⇒ pixel-stable —
   like Blazor.
2. At the expansion to 100,000 items **a report fires**: the size recalibrates (~49 → ~39px/item) and the window
   re-distributes as `itemsBefore = scrollTop / size ≈ 1251`. The same pixels now point at person ~1270; person 1000
   (now at pixel ~39,000) never reappears.
3. The window is ~38 rows per 198px container (≈7× the view) — both spacers remain off-screen ⇒ the IntersectionObserver
   never fires again ⇒ the state freezes; nothing recovers it within the 10s wait.

Blazor passes the same test because its distribution never re-points at the expansion: no spacer is in view, so no
recalibration and no re-distribution happen at all. The unidentified piece is **which mechanism fires the
expansion-time report at all**. Candidates named in X8's row: `reportRenderedContentMeasurement` via
`alignToItemAt`/`pendingAlignLocalIndex` (its RenderedContentMeasurement reason updates only the size, no
distribution — a report through the normal path must have come *before*), the `ResizeObserver`'s spacer re-observe
(`unobserve`/`observe` re-delivers an entry for an out-of-view spacer), and the refresh-load path.

Reproduces standalone-ish: `node scripts/verify.mjs --suite virtualize --group a,b` in apps/blazor-parity (Edge,
fluent) fails in ~1 of 3 runs; the trajectory in the failure carries all the evidence above. Next steps (in that row):
bisect the trigger; then either (a) re-point compensation — keep the anchored item under a size recalibration — or
(b) only distribute without a visible spacer when the anchor stays put.

Two tooling lessons (both bit me here, both in the test files now): a `page.evaluate` callback runs **in the browser**
— fill Node-side arrays from the returned value; and keep an "eval failed" catch in samplers, a swallowed rejection
reads like a frozen page.

## X9 — the templates' model modules were invalid JS (fixed)

The gallery's login page threw `SyntaxError: Invalid or unexpected token` in
`dist/templates/login-credentials.js`: a library build's `.ts` helpers (the templates' model classes, `@Required()`
field rules) left as **raw stage-3 decorator syntax** in the built JS. The helpers' esbuild transform lacked
`supported: { decorators: false }`, so esbuild passed the syntax through — the components, compiled with it, lowered.
esbuild's plain `ts` transform passes stage-3 decorators through raw in every configuration probed; it lowers only
when `supported.decorators: false`.

Fix: the helpers compile exactly as the components are — registering field decorators compacted first
(`compactFieldDecorators`), then esbuild with the components' transform (`COMPONENT_TRANSFORM`), then the shared
`_decorators.js` import (`shareHelpers`) and relative specifiers rewritten (`builtSpecifiers`). Both skins rebuilt;
all eight affected model modules are valid JS. Found by the gallery in free navigation — exactly the value the
showcase is supposed to deliver ("copied snippet = what the page runs, and it must run").

## Environment and process notes

- Showcase dev server was running on **localhost:5355** (5353/5354 occupied) when the session ended; it had been
  killed once mid-session by an overly broad `taskkill //IM node.exe` during the flake hunt and restarted on request.
  Never kill `node.exe` by image name.
- The parity suite is timing-sensitive at ~1 in 4 runs because of X8; everything else in this session's suites was
  deterministic. The gates' full parity run passes except for that one test when it fires.
- `feedback.md` / `feedback-2.md` remain untracked and untouched (owner: "Lass den erst mal da liegen und arbeite … weiter").
  Integrated later the same day (I1–I9 in [migration-practices.md](migration-practices.md)); the files themselves
  stay out of the repository (owner).
- Pushes: `220166c..a75e1f2` pushed as the session's milestone batch, then `66833d7` (X9) with this handoff.

## Owner-gated queue (unchanged by this session, one addition)

| Item | Note |
|---|---|
| **X8** (new) | the provider-expansion re-point — the one reproducible flake left in the parity suite |
| Spreadsheet, cluster 7 chrome | only "on the owner's word" (design doc: markup v1 without formulas per D-X4) |
| RichText2 engine swap | one line once RichText2 is on npm (the showcase's stub factory already points there) |
| ~~feedback.md / feedback-2.md integrate~~ | done later the same day (I1–I9, see the review below) |
| Tutorial K.7/K.8 failures | 4 pre-existing test failures, untouched this session |
| BlazorHero phases 5/6, E9 person | the standing 1.0 blockers with FluentCMS |

## Review of this session's work (2026-10-17, later)

The report and this handoff held; four things didn't, and the external integration's feedback came in alongside.

| Found | Done |
|---|---|
| X7's own jump scroll made every handled Home/End a jump: a tab list, listbox or rating in a row (or anywhere on a window-scrolled page) sent the list to the edge | A17: a key a widget already handled is no jump key (`d199e72`, E2E `Tsazor_HomeHandledByAWidgetInARow_…`); X7's "unit-tested" corrected — the E2E covers it |
| X9 had no test | `build-lib.test.ts` builds a decorated helper (fails on the pre-fix code) |
| The spreadsheet model: a paste was n undo steps and n renders; the stack copied itself on every set (20,000 sets 850 ms, quadratic); a `{ column: "B" }` cell missed its A1 twin | a step holds all cells of an action (a paste is one step, one render), the stack grows in place (12 ms), keys lowercase the column; the header no longer promises CSV text |
| `packages/primitives` and `packages/spreadsheet` were missing from the root vitest projects (`pnpm test` green without them; CI's `pnpm -r test` ran them); `api:check` failed on the spreadsheet's missing snapshot | both in the projects; `api/spreadsheet.api.d.ts` written |
| The feedback (I1–I9): inherited `@import`s and `@inject` lost their errors, class-level errors were dropped (that hid a real `Rating` bug), skin parameter types from `@tsazor/ui` were `any` under pnpm, `@bind` errors came fourfold, `@bind:event` on a component vanished, TZS024 cascaded | `3c68a92`, `f92151c`, `0d611e6`; see CHANGELOG and migration-practices.md |

Open, for the owner:

- **The spreadsheet's data source.** The model is a free A1 sheet; a data-driven app wants a sheet over records
  (rows from the backend, columns its properties, typed cells, the changes as patches to save). Proposal: a source
  interface before the chrome, with a record adapter and the free sheet as two implementations. Also open: TSV in
  and out of the system clipboard (pasting from Excel).
- **The CHANGELOG has no entries for the extended line** (DataGrid advanced, RichText, Scheduler, AI, templates,
  PivotDataGrid, spreadsheet), though they change the skins' public API: a section of their own, or entries as they
  stabilize?
- X8 as above.