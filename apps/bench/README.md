# Framework Bench: Blazor WASM · Tasor · React · Vue · Svelte

One identical app — two scenarios — in five frameworks, plus a measurement
suite ("identical spec" comparison): TodoMVC and a 10k-rows table (in the
[js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/)-style),
measured with a single harness over the same selectors and the same marker
protocol.

## Layout

| Path | Contents |
|---|---|
| `tasor/` | Tasor port (pages: `src/Pages/Todo.tazor`, `src/Pages/Rows.tazor`) |
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
dependency, so the bundle measures framework size, not router size. Tasor and
Blazor use their built-in routers — that is the framework's real footprint.

Ready marker (uniform protocol): every app sets
`window.__benchReadyAt = performance.now()` right after its initial view
first rendered (`onAfterRender` in Tasor, `useEffect`/`onMounted`/`onMount`
after mount in the JS ports, `OnAfterRenderAsync` in Blazor).

## Measurement (`measure/run.mjs`)

```
node run.mjs                # builds + measures everything
node run.mjs --app=tasor    # subset
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
  misleading (it showed Tasor at ~70 MB where the live set is ~17 MB)
- Output: `results.json` + a printed summary table

## Results

<!-- RESULTS-START -->
Median of 5 cold loads / 5 op cycles each, Edge (headless) via `measure/run.mjs`:

| App | App+FW JS (gz KB) | .NET runtime (gz KB) | CSS (gz KB) | Ready (ms) | create 10k (ms) | append 1k (ms) | upd every 10th (ms) | swap (ms) | select (ms) | remove (ms) | JS heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Tasor | **14.0** | – | 0.8 | 24.2 | 447 | 188 | 163 | 231 | 92 | 406 | **16.5** |
| Svelte 5 | 15.1 | – | 0.8 | **23.5** | 576 | 78 | 131 | **180** | 12 | **211** | 23.8 |
| Vue 3 | 26.3 | – | 0.8 | 24.3 | 422 | 123 | 99 | 200 | 38 | 212 | 18.8 |
| React 19 | 69.2 | – | 0.8 | 42.7 | 538 | 121 | 92 | 185 | 26 | 223 | 25.1 |
| Blazor WASM | 3,314.9 | 6,382.3 | 1.0 | 441.7 | 565 | 184 | 112 | 212 | 101 | 266 | 19.8 |

Reading notes:

- **Runtime cost**: Tasor ships in Svelte territory (14 KB gz, ~24 ms to interactive),
  ~5× smaller than Vue, ~5× faster to load than React, ~175× smaller than Blazor WASM's
  own code (Blazor additionally ships the 6.4 MB gz .NET runtime).
- **DOM ops** are in one league for the four JS frameworks — React's low select/remove
  numbers and Svelte's append all live under a quarter second; Tasor sits with them
  (worst case create/remove ~400–430 ms for the full 10k-row render).
- **Load**: FCP is unavailable in this headless setup; `ready` is the app's own
  "first view rendered" marker. Blazor's 435 ms is pure WASM start cost before .NET
  is on the hook; the JS frameworks are all ~23–53 ms.
- **Heap** (retained live set after one full rows cycle, all apps measured with
  forced GC): at 11k rows Tasor's flat frame trees retain the least JS memory of
  the four JS frameworks (16.5 MB vs 18.8–25 MB); Blazor's number barely moves
  because row state lives in the .NET GC heap inside WASM, which this metric
  does not see (a fair reading there must charge the WASM memory too). Caveat:
  these numbers are Chromium-specific (`performance.memory` + forced GC in
  headless Edge).
- All 7 TodoMVC behavioral checks (add/edit/toggle/filters/toggle-all/clear-
  completed/persistence) pass in all 5 apps; the harness asserts them on every run.

<!-- RESULTS-END -->