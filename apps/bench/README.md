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
As of 2026-10-05. Median of 5 cold loads / 5 op cycles each, Edge (headless) via `measure/run.mjs`.
Loads whose request the browser held back (`requestStart − fetchStart` > 100 ms, a cold-browser
effect on this machine) are retried; the measurement starts after a warm-up.

| App | App+FW JS (gz KB) | .NET runtime (gz KB) | CSS (gz KB) | Ready (ms) | create 10k (ms) | append 1k (ms) | upd every 10th (ms) | swap (ms) | select (ms) | remove (ms) | JS heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Tsazor | 25.4 | – | 0.8 | 80 | **280** | 82 | 72 | **151** | 20 | 313 | **15.4** |
| Svelte 5 | **15.1** | – | 0.8 | 115 | 353 | **51** | 95 | 155 | **11** | 181 | 23.8 |
| Vue 3 | 26.3 | – | 0.8 | **72** | 292 | 81 | 77 | 167 | 29 | **176** | 18.8 |
| React 19 | 69.2 | – | 0.8 | 103 | 366 | 87 | **71** | 156 | 19 | 178 | 25.2 |
| Blazor WASM | 5,427 | 10,660 | 1.0 | 339 | 311 | 101 | 63 | 153 | 54 | 196 | 19.8 |

Reading notes:

- **Size**: Tsazor ships 25.4 KB gz for this app (framework + app), on a par with Vue and 2.7×
  smaller than React; Svelte compiles to the least. Features an app does not use stay out of the
  bundle (document head and sections, localization, error boundaries — R5, 2026-10-05:
  29.4 → 25.4 KB).
- **Load**: `ready` (the app's own "first view rendered" marker) is 70–115 ms for all four JS
  frameworks in this run and varies by ±30 ms between runs on this machine — no ranking among
  them; Blazor WASM needs ~340 ms to start the .NET runtime.
- **DOM ops**: Tsazor is fastest at creating 10k rows and swapping, on a par at append and
  update; it trails at **select** (20 vs 11 ms for Svelte) and clearly at **remove** (313 vs
  ~180 ms): its component-level diff walks the whole frame tree where Svelte updates the one
  binding. These are the targets of F1b (update hints, hoisting).
- **Heap** (retained live set after one full rows cycle, forced GC): Tsazor's flat frame trees
  retain the least JS memory (15.4 MB vs 18.8–25.2 MB). Blazor's row state lives in the .NET heap
  inside WASM, which this metric does not see. Chromium-specific (`performance.memory` + forced GC).
- All 7 TodoMVC behavioral checks pass in all 5 apps; the harness asserts them on every run.

<!-- RESULTS-END -->

## F1a — static markup blocks (Tsazor only)

`measure/static-markup.mjs` builds the Tsazor app with and without static markup blocks
(`TSAZOR_STATIC_MARKUP=0`) and times the `/cards` page: 3,000 cards with static chrome and a
dynamic price. Results and the rows A/B: [docs/design-static-markup.md §8](../../docs/design-static-markup.md#8-results-2026-10-04).
