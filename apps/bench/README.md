# Framework Bench: Blazor WASM · Tsazor · React · Vue · Svelte

One identical app — two scenarios — in five frameworks, plus a measurement
suite ("identical spec" comparison): TodoMVC and a 10k-rows table (in the
[js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/)-style),
measured with a single harness over the same selectors and the same marker
protocol.

## Layout

| Path | Contents |
|---|---|
| `tsazor/` | Tsazor port (pages: `src/Pages/Todo.tsazor`, `src/Pages/Rows.tsazor`) |
| `react/` | React 19 port |
| `vue/` | Vue 3 port |
| `svelte/` | Svelte 5 port |
| `blazor/` | Blazor WASM (.NET 10, `dotnet new blazorwasm --empty`) |
| `bench.css` | shared stylesheet — byte-identical for all five apps |
| `measure/` | benchmark runner (`node run.mjs`) |

## App spec (identical for all 5)

Two routes:

- `/todo` — TodoMVC: add (Enter), toggle, toggle-all, delete, edit
  (double-click; Enter/blur commits, Escape cancels), filters
  all/active/completed, "Clear completed", localStorage persistence,
  "n items left" count.
- `/rows` — 10k-rows table: create 10,000 / append 1,000 rows
  (random 6-digit id + "item #<id>" label), update every 10th row
  (label += " !!!"), swap first two rows, select row on title click
  (highlight), remove per-row "×".

No backend: both scenarios are client-only. The four JS apps switch views
via a deliberate 3-line hash switch (`#/todo`, `#/rows`) instead of a router
dependency, so the bundle measures framework size, not router size. Tsazor and
Blazor use their built-in routers — that is the framework's real footprint.

Ready marker (uniform protocol): every app sets
`window.__benchReadyAt = performance.now()` right after its initial view
first rendered (`onAfterRender` in Tsazor, `useEffect`/`onMounted`/`onMount`
after mount in the JS ports, `OnAfterRenderAsync` in Blazor).

## Measurement (`measure/run.mjs`)

```
node run.mjs                # builds + measures everything
node run.mjs --app=tsazor    # subset
node run.mjs --runs=10 --skip-build
```

- **Bundle**: sum of built assets; JS ("code gz") measured per-framework
  (Blazor: runtime assets separated from `Bench.dll` and boot js)
- **Load** (median of 5 cold navigations, fresh browser context each):
  FCP from the paint timeline; **ready** = the app's `__benchReadyAt`
- **Ops** (median of 5 in-browser timed cycles): click → DOM-settled poll,
  so event handling, state change and re-render are all inside the number
- **Memory**: retained JS heap (median of 3 samples after forced garbage
  collection via CDP `HeapProfiler.forceGC`) after one full rows cycle —
  a plain `performance.memory` reading is dominated by uncollected garbage and
  misleading (it showed Tsazor at ~70 MB where the live set is ~17 MB)
- Output: `results.json` + a printed summary table

## Results

<!-- RESULTS-START -->
Median of 5 cold loads / 5 op cycles each, Edge (headless) via `measure/run.mjs`:

| App | App+FW JS (gz KB) | .NET runtime (gz KB) | CSS (gz KB) | Ready (ms) | create 10k (ms) | append 1k (ms) | upd every 10th (ms) | swap (ms) | select (ms) | remove (ms) | JS heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Tsazor | **14.1** | – | 0.8 | **23.5** | **450** | 178 | 156 | 220 | 85 | 406 | **16.5** |
| Svelte 5 | 15.1 | – | 0.8 | 23.7 | 570 | **77** | 130 | 180 | **10** | **208** | 23.8 |
| Vue 3 | 26.3 | – | 0.8 | 24.2 | 425 | 124 | 99 | 198 | 37 | 222 | 18.8 |
| React 19 | 69.2 | – | 0.8 | 40.1 | 551 | 121 | **92** | **180** | 26 | 218 | 25.2 |
| Blazor WASM | 3,314.9 | 6,465.6 | 1.0 | 436.6 | 559 | 185 | 113 | 215 | 103 | 271 | 19.9 |

Reading notes:

- **Runtime cost**: Tsazor ships in Svelte territory (14 KB gz, ~24 ms to
  interactive), ~5× smaller than Vue, ~2× faster to load than React, ~235×
  smaller than Blazor WASM's own code (Blazor additionally ships the 6.4 MB
  gz .NET runtime).
- **DOM ops** are in one league for the four JS frameworks — every median is
  under half a second. The wins are situational: Vue the 10k mount, Svelte
  append/select/remove, React the surgical updates; Tsazor's diff-based path
  pays for the volumetric ones (create/remove build and diff the full 10k
  frame tree, ~400–450 ms).
- **Load**: FCP is only sporadically reported in this headless setup (60 ms
  for Blazor in the current run, absent everywhere else); `ready` is the
  app's own "first view rendered" marker, ~23–24 ms for Tsazor/Vue/Svelte,
  40 ms React, 437 ms WASM start for Blazor.
- **Heap** (retained live set after one full rows cycle, all apps measured with
  forced GC): at 11k rows Tsazor's flat frame trees retain the least JS memory of
  the four JS frameworks (16.5 MB vs 18.8–25 MB); Blazor's number barely moves
  because row state lives in the .NET GC heap inside WASM, which this metric
  does not see (a fair reading there must charge the WASM memory too). Caveat:
  these numbers are Chromium-specific (`performance.memory` + forced GC in
  headless Edge).
- All 7 TodoMVC behavioral checks (add/edit/toggle/filters/toggle-all/clear-
  completed/persistence) pass in all 5 apps; the harness asserts them on every run.

<!-- RESULTS-END -->

## F1a — static markup blocks (Tsazor only)

`measure/static-markup.mjs` builds the Tsazor app with and without static markup blocks
(`TSAZOR_STATIC_MARKUP=0`) and times the `/cards` page: 3,000 cards with static chrome and a
dynamic price. Results and the rows A/B: [docs/design-static-markup.md §8](../../docs/design-static-markup.md#8-results-2026-10-04).
