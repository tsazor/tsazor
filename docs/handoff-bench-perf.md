# Handoff: bench suite + runtime perf round (2026-09-29, session end)

State after "Solve this now." + "Okay for commit" + the runtime perf round.
To be read together with `docs/handoff-lsp-v2.md` (LSP v2/VSIX 0.3.4, still valid).

## 1. Git state

**Committed (3 commits on main, today):**
- `3853eaa` runtime memory refactor: retained heap 18.2 → 17.1 MB at 11k rows
  (render-tree.ts: object literals instead of a 17-field frame class, in-place mutation
  via an `EditableFrame` cast, `renderedNodes` as a dense array instead of a Map;
  component-state.ts, dom-renderer.ts)
- `a22dc55` bench: identical TodoMVC+10k-rows app in 5 stacks + measurement suite
  (apps/bench/ complete, .gitignore extension, pnpm-workspace/lock)
- `5275769` LSP/vite-plugin: shadow false-positive filter (TS2307 static
  assets, TS2564 @Parameter), eager LSP fixes, handoff (docs/handoff-lsp-v2.md)

**NOT committed (deliberately open, ongoing from today):**
- **Runtime perf round** (see §3): `packages/runtime/src/renderer/renderer.ts`,
  `dom-renderer.ts`, `component-state.ts`
- **`apps/demo/src/Pages/Counter.tsazor`** — the user's manual change
  (`private currentCount : number = 0;`) — **do NOT touch, do NOT commit**,
  still applies (the user decides)

## 2. Bench (apps/bench/) — final picture

Identical app (TodoMVC + 10k rows) in Tsazor / React 19 / Vue 3 / Svelte 5 /
Blazor WASM (dotnet 10); measurement suite `apps/bench/measure/run.mjs` (Playwright,
msedge headless): 5 cold loads, 5 op cycles, **forced-GC heap** via CDP
`HeapProfiler.forceGC` (+ `--js-flags=--expose-gc` fallback), median; output in
`results.json` + README table (block `<!-- RESULTS-START -->`).

**Final numbers (all from one run, forced GC, 11k rows):**

| App | JS gz KB | .NET runtime gz KB | ready ms | create10k | append1k | upd10th | swap | select | remove | heap MB |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Tsazor | **14.1** | – | **23.5** | 450 | 178 | 156 | 220 | 85 | 406 | **16.5** |
| Svelte 5 | 15.1 | – | 23.7 | 570 | **77** | 130 | 180 | **10** | **208** | 23.8 |
| Vue 3 | 26.3 | – | 24.2 | **425** | 124 | 99 | 198 | 37 | 222 | 18.8 |
| React 19 | 69.2 | – | 40.1 | 551 | 121 | **92** | **180** | 26 | 218 | 25.2 |
| Blazor WASM | 3,314.9 | 6,465.6 | 436.6 | 559 | 185 | 113 | 215 | 103 | 271 | 19.9 |

**Key insights (worth gold for the article):**
1. The previously reported "double heap" (Tsazor ~70 vs. React/Svelte ~40 MB) was
   **NOT a design problem**, but uncollected garbage in
   `performance.memory.usedJSHeapSize`. With forced GC the retained
   live set of ALL JS frameworks is 16–25 MB; at 16.5 MB Tsazor has the
   smallest JS value. Blazor has to be judged fairly with WASM memory
   (state lives in the .NET GC heap, which this metric does not see) — the caveat is in the README.
2. Memory refactor A/B (heap-probe.mjs, forced GC, full rows cycle):
   17-field frame class **24.4 MB** (WORSE — text/attr frames are ~⅔ of all
   frames), literals+spreads 18.2, **hybrid final 17.1** (no spreads,
   in-place `subtreeLength`/key mutation via an `EditableFrame` cast).

**Reproduction:** `apps/bench/measure` → `node run.mjs` (builds everything,
~10 min because of the Blazor publish), `--app=<name>` subset, `--runs=10 --skip-build`
for repetition WITHOUT builds. **Gotcha: do NOT use `--skip-build` after
packages/runtime has changed** — the tsazor dist bundles the runtime.
Single heap probe: `node heap-probe.mjs` (Tsazor /rows, CDP forced GC, 3 samples).

## 3. Runtime perf round (UNCOMMITTED, 135/135 tests green, heap parity 16.5 MB)

The user chose "runtime perf" out of four directions. Three levers implemented:

1. **Builder ping-pong per ComponentState** (`renderer.ts` flush +
   `component-state.ts`): tuple `renderBuilders = [new RenderTreeBuilder(), new …]`
   + `renderPass ^= 1` — no builder/frame array allocation per render pass.
   **CRITICAL: the *other* builder is cleared at the END of the flush** (after
   diff+assign), not the fresh one at the start. The first version cleared the
   other one at the start → retained the tree from two passes back (measured: 23.7 MB instead of
   16.5), and an intermediate version without the toggle cleared the LIVE tree — both
   bugs only showed up in the forced-GC probe, not in the tests.
2. **Detached mount** (`dom-renderer.ts` processElement, creation path): fresh
   element subtrees build children into the (still) detached element and insert
   ONCE per element instead of per node → `insertBefore` count ~3n→n on mounts.
   The update path (canUpdate) stays live-inserting, unchanged. ElementReferenceCapture
   can transiently see a detached parentDom (works, same element objects).
3. **Attribute fast path** (`dom-renderer.ts` `updateAttributesFastPath` +
   helper `attributeRunEnd`): a linear pairwise walk over the contiguous
   attribute runs (assuming name/order identity, `attributeValueSame` per
   pair) instead of 2 Maps per element per diff; fallback to the `attributeMap` path on
   length/name mismatch. Attribute runs are contiguous directly after the start frame
   (up to the subtree end or the first non-attribute frame).

**Honest measurement verdict (before → after, --app=tsazor + full suite):**
upd10th 163→156, select 92→85, append1k 188→178; create10k/remove within noise
(450/406). **Median ops ≈ unchanged** — at 11k rows the dominant cost
share is the full frame tree (building+diffing) per pass; that is the architectural
price of the Blazor flat-tree diff model. The gain of this round lies in
**allocation pressure** (no builder/array per pass, no Map pairs per element diff,
n inserts per element frame instead of per node) → less GC pressure, a more even
latency distribution; not in medians in this scenario.

## 4. Open next directions (for the user to decide, nothing started)

- **More perf (architectural):** against the 2× create/remove vs. Svelte/Vue
  no micro-optimization helps anymore — topics: subtree memoization, a keyed-component fast path
  or incremental diff segments (diff only changed regions instead of a
  full `matchChildren` pass + attribute pair walk over 11k × ~10 frames per pass).
  The realistic next lever would be an "unchanged subtree skip" via a cheap
  content hash of the frame segments — design work, no longer a micro-optimization.
- **Broaden the bench:** WebKit/Firefox channels (the heap metric is
  `performance.memory` + forced GC — **Chromium-specific**, caveat in the README);
  a second scenario "many small components" (Tsazor's per-component slot costs are unmeasured).
- **Framework article:** the numbers + methodology + key insight (GC artifact!)
  are reproducible in `apps/bench/measure/run.mjs` — that was the original motivation.
- **Feature backlog (docs/, not started):** named child slots, `@bind:format`,
  `tsazor typecheck` CLI, LSP rename, published npm layout @tsazor/components,
  Web Components direction B (`defineCustomElement`, ~150–250 lines, user-approved as a direction).
- **Open user acceptance (from the LSP round):** check LSP completions/diagnostics manually in
  VS Code on sleipnir-ticker (Store. completions, points hover, go-to-definition, squiggles).

## 5. Verification state tonight

- `pnpm --filter @tsazor/runtime build` clean; `pnpm -w test` **135/135**
  (run after EACH of the three perf changes)
- Full bench suite: exit 0, **0 page errors, 7/7 TodoMVC checks × 5 apps**,
  removeWorked true everywhere; the numbers above are from this run (bu7hsox6n / 21:4x)
- Heap probe (forced GC, 3 samples): **16.5 MB** stable (17.1/17.1/17.1 measured with
  the 11k rows cycle — parity with the pre-perf state, BUT with the
  allocation fix: no more builder/array garbage per pass)

## 6. Question for tomorrow (user, session end): breakpoints in VS Code

The user set breakpoints in Chrome DevTools (worked), NOT in VS Code — does that work?
Proposed answer (to implement + verify with a real breakpoint):
1. Open a **JavaScript Debug Terminal** in VS Code → start the Vite dev server
   in it (apps/demo, port 5199) → VS Code attaches automatically. Then set breakpoints
   directly in `src/Pages/Counter.tsazor` — VS Code's JS debugger understands the inline source maps
   (compiler→esbuild chain, same basis as the proven
   `verify-debugging.mjs` chain) without extra setup.
2. Alternatively `launch.json`: `{ "type": "chrome", "request": "launch",
   "url": "http://127.0.0.1:5199", "webRoot": "${workspaceFolder}/apps/demo" }`.
Gotcha: if a breakpoint does not resolve (hollow circle), check
`webRoot`/`sourceMapPathOverrides` against the `sources` paths of the inline map
(decodable as in verify-debugging.mjs). Code-behind `.ts` breakpoints are
native Vite TS debugging (no map magic).

## 7. Today's gotchas (new, in addition to handoff-lsp-v2.md)

- **Bench commit:** the .gitignore did not cover bench build outputs —
  `apps/bench/blazor/{bin,obj,publish}/` + `apps/bench/*/dist|node_modules/`
  are now ignored (1,402 build output files were included in the first
  commit attempt, removed via `git rm -r --cached` + `--amend`).
- The Blazor publish output lives under `publish/wwwroot/` (not `publish/`).
- The ready marker must go into EVERY .razor (`OnAfterRenderAsync` + JS `eval`);
  Rows.razor only got it added later.
- Headless FCP is spotty (only Blazor runs report paint entries at all):
  null passthrough in the harness, no FCP pseudo-zeros in the table.
- Random 6-digit row ids collide statistically at 11k (→ unique-id loop in
  all 5 ports); React: re-creating the Set in the component body = duplicate
  keys + phantom <tr>s → `useRef(new Set())`.
- `--skip-build` in run.mjs after runtime changes: the tsazor dist is stale
  (it bundles the runtime) → rebuild first.
- Windows Git: LF→CRLF warnings on adds — harmless, but detecting the amend case
  ("who just committed 1,402 files?") works via
  `git show --stat HEAD | tail`.
