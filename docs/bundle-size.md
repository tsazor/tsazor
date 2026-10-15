# Bundle size

What a Tsazor app ships, measured against the React app it was ported from, and how to measure your own.

## Where the bytes go

The [fullstackhero port](port-fullstackhero.md) and its React original do the same work: the same pages, the same
API, and the same acceptance suite. The table shows both production builds (`vite build`) with every byte of every
chunk traced back to its source through the source maps (as of 2026-10-15). Sizes are KB gzip.

| | Tsazor port | React original |
|---|---:|---:|
| App components (`.tsazor` / `.tsx`) | 165.5 | 107.4 |
| App code (`.ts`) | 14.7 | 9.1 |
| Framework (Tsazor runtime / React + ReactDOM) | 34.4 | 57.7 |
| UI and React libraries (`@tsazor/ui` / react-router, react-hook-form, sonner, Radix, …) | 2.8 | 83.9 |
| Shared libraries (SignalR, zod, TanStack Query core, qrcode, …) | 59.2 | 56.7 |
| Unmapped (bundler glue) | 9.6 | 7.9 |
| **All chunks** | **286.2** | **322.7** |
| **First load** (the JS `index.html` loads; gzip -9) | **104.2** | **187.1** |

The two parts of an app weigh differently:

- **The fixed part is smaller.** The runtime brings the router, forms and validation, authorization, dependency
  injection and the rest of Blazor's built-ins. A React app adds all of that as libraries. Here that was 37 KB
  against 142 KB.
- **The part per component is bigger.** A compiled `.tsazor` component is larger than the same component in JSX.
  It calls the render builder frame by frame, and every `@Parameter`, `@Inject` or `@CascadingParameter` field is
  registered through a decorator. The port's 11,800 lines of `.tsazor` compile to 165 KB; the original's 17,900
  lines of `.tsx` compile to 107 KB.

So Tsazor's lead is largest for small and mid-sized apps, and it shrinks as the number of components grows. The
first load stays small either way: with lazy routes (`tsazor({ lazyRoutes })`, [design-lazy-routes.md](design-lazy-routes.md))
each page is a chunk of its own.

For a small app across frameworks, see the bench ([apps/bench](../apps/bench/README.md)), which measures size,
load time, DOM operations and heap for Tsazor, Svelte, Vue, React and Blazor WASM.

## Decorator helpers: one copy per app

No browser runs standard decorators natively yet, so esbuild lowers them. It writes about 1.7 KB of helper
functions (`__decorateElement`, `__runInitializers`, …) at the top of every module it transforms. A bundler keeps
every copy, because the helpers are module-scoped.

Tsazor shares them instead. The Vite plugin serves them once as `virtual:tsazor-decorators`, and every compiled
component imports them from there. A library built by `tsazor build-lib` ships them once as `dist/_decorators.js`,
and the plugin points that module at the app's copy as well.

A helper is shared only if its text is exactly the shared one. A helper that another esbuild version wrote
differently stays where it is.

Measured on all JS chunks, gzip -9 per file:

| App | Before | After | |
|---|---:|---:|---:|
| fullstackhero port (72 chunks, `@tsazor/ui`) | 318.5 | 282.9 | −11% |
| fluentcms (75 chunks, `@tsazor/fluent`) | 265.3 | 239.7 | −10% |
| demo | 104.4 | 96.7 | −7% |
| gallery (`@tsazor/fluent`) | 163.5 | 153.2 | −6% |

Plain `.ts` modules with decorators keep their own copy. Examples are model classes with validation rules and
component base classes. Vite's esbuild transforms these modules, not the Tsazor plugin.

## Measuring your own app

- `vite build` prints every chunk's size, raw and gzip. The first load is the entry chunk plus the chunks that
  `index.html` preloads.
- To see where the bytes come from, build with `vite build --sourcemap` and attribute the chunks to their sources.
  Use a source-map explorer or `rollup-plugin-visualizer`. Group the sources the way the table above does:
  framework, your components, your code, libraries.
- Compare against a port only when both apps do the same work. Libraries the original needs and Tsazor builds in
  (routing, forms, validation, toasts, dialogs) belong in the comparison.
