# Framework Bench: Blazor WASM · Tsazor · React · Vue · Svelte

One identical app — two scenarios — in five frameworks, plus a measurement
suite ("identical spec" comparison): TodoMVC and a 10k-rows table (in the
[js-framework-benchmark](https://krausest.github.io/js-framework-benchmark/)-style),
measured with a single harness over the same selectors and the same marker
protocol.

## Layout

| Path | Contents |
|---|---|
| `tsazor/` | Tsazor port (pages: `src/Pages/Todo.tsazor`, `src/Pages/Rows.tsazor`; `src/App.tsazor` switches them by hash, `src/RouterApp.tsazor` with the Router — `--mode router`) |
| `react/` | React 19 port |
| `vue/` | Vue 3 port |
| `svelte/` | Svelte 5 port |
| `blazor/` | Blazor WASM (.NET 10, `dotnet new blazorwasm --empty`) |
| `bench.css` | shared stylesheet — byte-identical for all five apps |
| `measure/` | benchmark runner (`node run.mjs`) |

## App spec (identical for all)

Two views:

- `#/todo` — TodoMVC: add (Enter), toggle, toggle-all, delete, edit
  (double-click; Enter/blur commits, Escape cancels), filters
  all/active/completed, "Clear completed", localStorage persistence,
  "n items left" count.
- `#/rows` — 10k-rows table: create 10,000 / append 1,000 rows
  (random 6-digit id + "item #<id>" label), update every 10th row
  (label += " !!!"), swap first two rows, select row on title click
  (highlight), remove per-row "×".

No backend: both scenarios are client-only. Tsazor and the three JS apps switch
views via a deliberate hash switch (`#/todo`, `#/rows`) instead of a router, so
the bundle measures the framework, not a router — React's, Vue's and Svelte's
routers are separate packages and aren't in their numbers either. Tsazor's
Router is part of its runtime, so a second row, `tsazor-router`, measures the same
app as it is usually written: Tsazor's `Router` in hash mode, a layout and
`NavLink` (`src/RouterApp.tsazor`, `vite build --mode router`). Until 2026-10-15
the table measured only that, in history mode. What Vue's and React's routers add,
and how the frameworks differ beyond the numbers:
[docs/compared-to-react-and-vue.md](../../docs/compared-to-react-and-vue.md).
Blazor uses its Router; its .NET runtime dominates its numbers anyway.

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
As of 2026-10-15: the runtime's components without decorator lowering, the ES2022 build target, the
Tsazor app with a hash switch like the others and a second row with its Router. Median of 10 cold loads /
10 op cycles each for the JS apps (Blazor: 5, from a run the same day), Edge (headless) via
`measure/run.mjs`. Loads whose request the browser held back (`requestStart − fetchStart` > 100 ms, a
cold-browser effect on this machine) are retried; the measurement starts after a warm-up. Every app keys
its rows (`@key` in Tsazor and Blazor, `(row.id)`/`:key`/`key=` in Svelte/Vue/React).

| App | App+FW JS (gz KB) | .NET runtime (gz KB) | CSS (gz KB) | Ready (ms) | create 10k (ms) | append 1k (ms) | upd every 10th (ms) | swap (ms) | select (ms) | remove (ms) | JS heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Tsazor | 24.3 | – | 0.8 | **21.9** | **283** | 72 | **63** | **100** | **8.2** | **98** | **15.2** |
| Tsazor + Router (hash) | 28.2 | – | 0.8 | 23.0 | 284 | **67** | 65 | 103 | 9.7 | **98** | 15.3 |
| Svelte 5 | **15.1** | – | 0.8 | 22.1 | 359 | 104 | 81 | 158 | 10.5 | 177 | 23.8 |
| Vue 3 | 26.3 | – | 0.8 | 22.9 | 289 | 84 | 76 | 161 | 28.5 | 179 | 18.8 |
| React 19 | 69.2 | – | 0.8 | 38.1 | 360 | 86 | 69 | 156 | 14.2 | 174 | 25.1 |
| Blazor WASM | 5,427 | 10,910 | 1.0 | 301 | 319 | 113 | 70 | 166 | 62.2 | 166 | 19.8 |

Reading notes:

- **Size**: Tsazor ships 24.3 KB gz for this app (framework + app), less than Vue (26.3) and 2.8×
  less than React; Svelte compiles to the least. Its Router in hash mode adds 3.9 KB; Vue's router
  adds 9.1 KB and React's 12.7 KB to these apps
  ([compared-to-react-and-vue.md](../../docs/compared-to-react-and-vue.md)). Features an app does
  not use stay out of the bundle (document head and sections, localization, error boundaries — R5).
  On 2026-10-06 the app was 26.2 KB with the Router (history mode); the navigation hold (E13) and the
  parity work since then added 3.7 KB, the runtime's components without decorator lowering and the
  ES2022 build target took 1.5 KB of it back ([docs/bundle-size.md](../../docs/bundle-size.md)).
- **Load**: `ready` (the app's own "first view rendered" marker) is 22–23 ms for Tsazor, Svelte and
  Vue and 38 ms for React; Blazor WASM needs ~300 ms to start the .NET runtime.
- **DOM ops**: Tsazor leads at create, update every 10th, swap, select and remove. Two invisible
  compiler optimizations (F1b, [design-render-hints.md](../../docs/design-render-hints.md)) do it:
  event handlers that stay the same object while their captured values do (H1), and keyed rows whose
  values did not change are neither rebuilt nor diffed (H2). Blazor's semantics are unchanged —
  `optimize: false` emits what Razor would, and the gates compare both. Before F1b select took 21 ms;
  without `@key` remove took 313 ms (positional diffing rewrites every row after the removed one — key
  lists that change).
- **Append varies most between runs.** It is timed right after create 10k, and a garbage collection of
  that work may fall into it: over today's runs and 2026-10-06's, Svelte took 47–104 ms and Tsazor 12–72.
  In this run Tsazor is fastest; across runs Svelte and Tsazor take turns. Other op times vary by about
  10% between runs: compare within one run.
- **Heap** (retained live set after one full rows cycle, forced GC): Tsazor's flat frame trees
  retain the least JS memory (15.2 MB vs 18.8–25.1 MB). Blazor's row state lives in the .NET heap
  inside WASM, which this metric does not see. Chromium-specific (`performance.memory` + forced GC).
- All 7 TodoMVC behavioral checks pass in all 6 apps; the harness asserts them on every run.

<!-- RESULTS-END -->

## F1a — static markup blocks (Tsazor only)

`measure/static-markup.mjs` builds the Tsazor app with and without the compiler's optimizations
(`TSAZOR_OPTIMIZE=0`: no static markup blocks, no stable handlers) and times the `#/cards` view: 3,000 cards with static chrome and a
dynamic price. Results and the rows A/B: [docs/design-static-markup.md §8](../../docs/design-static-markup.md#8-results-2026-10-04).
