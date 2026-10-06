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
As of 2026-10-06, after F1b (render hints H1 + H2). Median of 5 cold loads / 5 op cycles each, Edge
(headless) via `measure/run.mjs`. Loads whose request the browser held back (`requestStart −
fetchStart` > 100 ms, a cold-browser effect on this machine) are retried; the measurement starts
after a warm-up. Every app keys its rows (`@key` in Tsazor and Blazor, `(row.id)`/`:key`/`key=` in
Svelte/Vue/React).

| App | App+FW JS (gz KB) | .NET runtime (gz KB) | CSS (gz KB) | Ready (ms) | create 10k (ms) | append 1k (ms) | upd every 10th (ms) | swap (ms) | select (ms) | remove (ms) | JS heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Tsazor | 26.2 | – | 0.8 | 23.5 | **283** | 68 | **66** | **94** | **7.8** | **98** | **15.3** |
| Svelte 5 | **15.1** | – | 0.8 | **21.6** | 347 | **47** | 94 | 150 | 9.9 | 168 | 23.8 |
| Vue 3 | 26.3 | – | 0.8 | 22.2 | 289 | 79 | 71 | 163 | 30.5 | 175 | 18.8 |
| React 19 | 69.2 | – | 0.8 | 36.7 | 354 | 80 | 68 | 159 | 18.8 | 163 | 25.2 |
| Blazor WASM | 5,427 | 10,827 | 1.0 | 305 | 319 | 112 | 69 | 166 | 59.6 | 156 | 19.9 |

Reading notes:

- **Size**: Tsazor ships 26.2 KB gz for this app (framework + app), on a par with Vue and 2.6×
  smaller than React; Svelte compiles to the least. Features an app does not use stay out of the
  bundle (document head and sections, localization, error boundaries — R5).
- **Load**: `ready` (the app's own "first view rendered" marker) is 21–24 ms for Tsazor, Svelte and
  Vue and 37 ms for React; Blazor WASM needs ~300 ms to start the .NET runtime. Load times vary by
  a few ms between runs on this machine.
- **DOM ops**: Tsazor leads at create, update every 10th, swap, select and remove, and trails only
  at append (68 vs 47 ms for Svelte). Two invisible compiler optimizations (F1b,
  [design-render-hints.md](../../docs/design-render-hints.md)) do it: event handlers that stay the
  same object while their captured values do (H1), and keyed rows whose values did not change are
  neither rebuilt nor diffed (H2). Blazor's semantics are unchanged — `optimize: false` emits what
  Razor would, and the gates compare both. Before F1b select took 21 ms; without `@key` remove took
  313 ms (positional diffing rewrites every row after the removed one — key lists that change).
- **Heap** (retained live set after one full rows cycle, forced GC): Tsazor's flat frame trees
  retain the least JS memory (15.3 MB vs 18.8–25.2 MB). Blazor's row state lives in the .NET heap
  inside WASM, which this metric does not see. Chromium-specific (`performance.memory` + forced GC).
- All 7 TodoMVC behavioral checks pass in all 5 apps; the harness asserts them on every run.

<!-- RESULTS-END -->

## F1a — static markup blocks (Tsazor only)

`measure/static-markup.mjs` builds the Tsazor app with and without static markup blocks
(`TSAZOR_STATIC_MARKUP=0`) and times the `/cards` page: 3,000 cards with static chrome and a
dynamic price. Results and the rows A/B: [docs/design-static-markup.md §8](../../docs/design-static-markup.md#8-results-2026-10-04).
