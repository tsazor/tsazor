# Bundle size

What a Tsazor app ships, measured against the React app it was ported from, and how to measure your own.

## Where the bytes go

The [fullstackhero port](port-fullstackhero.md) and its React original do the same work: the same pages, the same
API, and the same acceptance suite. The table shows both production builds (`vite build`) with every byte of every
chunk traced back to its source through the source maps (as of 2026-10-15). Sizes are KB gzip.

| | Tsazor port | React original |
|---|---:|---:|
| App components (`.tsazor` / `.tsx`) | 152.7 | 107.4 |
| App code (`.ts`) | 14.6 | 9.1 |
| Framework (Tsazor runtime / React + ReactDOM) | 34.4 | 57.7 |
| UI and React libraries (`@tsazor/ui` / react-router, react-hook-form, sonner, Radix, …) | 2.5 | 83.9 |
| Shared libraries (SignalR, zod, TanStack Query core, qrcode, …) | 58.9 | 56.7 |
| Unmapped (bundler glue) | 9.2 | 7.9 |
| **All chunks** | **272.4** | **322.7** |
| **First load** (the JS `index.html` loads; gzip -9) | **100.6** | **187.1** |

The two parts of an app weigh differently:

- **The fixed part is smaller.** The runtime brings the router, forms and validation, authorization, dependency
  injection and the rest of Blazor's built-ins. A React app adds all of that as libraries. Here that was 37 KB
  against 142 KB.
- **The part per component is bigger.** A compiled `.tsazor` component is larger than the same component in JSX:
  it calls the render builder frame by frame. The port's 11,800 lines of `.tsazor` compile to 153 KB; the
  original's 17,900 lines of `.tsx` compile to 107 KB.

So Tsazor's lead is largest for small and mid-sized apps, and it shrinks as the number of components grows. The
first load stays small either way: with lazy routes (`tsazor({ lazyRoutes })`, [design-lazy-routes.md](design-lazy-routes.md))
each page is a chunk of its own.

For a small app across frameworks, see the bench ([apps/bench](../apps/bench/README.md)), which measures size,
load time, DOM operations and heap for Tsazor, Svelte, Vue, React and Blazor WASM.

## Decorators

No browser runs standard decorators yet, so the build lowers them. Lowered, a decorated class costs a few hundred
bytes, and every module that has one gets about 1.7 KB of helper functions (`__decorateElement`,
`__runInitializers`, …). A bundler keeps every copy of those, because they are module-scoped. Tsazor saves both:

- **Compact field decorators.** Tsazor's own field decorators (`@Parameter()`, `@CascadingParameter()`,
  `@SupplyParameterFromQuery()`, the validation rules such as `@Required()`) only record the field in the class's
  decorator metadata. The build applies them right after the class, in one call, and the class keeps plain fields:
  `decorateFields(Badge, { intent: [Parameter()], pill: [Parameter()] })`. The metadata is the same, in the same
  order. Components get this, and so do the app's own `.ts` files (models with validation rules, base classes,
  code-behind) and libraries built by `tsazor build-lib`. A class with any other decorator stays as written: a class
  decorator, `@Bindable()` or `@State()` on an accessor, a decorator of your own. `optimize: false` turns this off
  ([language-reference.md](language-reference.md)).
- **The helpers once per app.** What is still lowered takes its helpers from one module: the Vite plugin serves
  them as `virtual:tsazor-decorators`, a library built by `tsazor build-lib` ships them once as
  `dist/_decorators.js`, and the plugin points that module at the app's copy. A helper is shared only if its text
  is exactly the shared one; one another esbuild version wrote differently stays where it is. A plain `.ts` module
  whose decorators stay (an accessor's, your own) keeps its copy: Vite's esbuild transforms it, not the plugin.

Measured on all JS chunks, gzip -9 per file (2026-10-15):

| App | Before | Helpers once | Fields compact | |
|---|---:|---:|---:|---:|
| fullstackhero port (72 chunks, `@tsazor/ui`) | 318.5 | 282.9 | 269.0 | −16% |
| fluentcms (75 chunks, `@tsazor/fluent`) | 265.3 | 239.7 | 225.6 | −15% |
| demo | 104.4 | 96.7 | 89.6 | −14% |
| gallery (`@tsazor/fluent`) | 163.5 | 153.2 | 142.6 | −13% |

## Measuring your own app

- `vite build` prints every chunk's size, raw and gzip. The first load is the entry chunk plus the chunks that
  `index.html` preloads.
- To see where the bytes come from, build with `vite build --sourcemap` and attribute the chunks to their sources.
  Use a source-map explorer or `rollup-plugin-visualizer`. Group the sources the way the table above does:
  framework, your components, your code, libraries.
- Compare against a port only when both apps do the same work. Libraries the original needs and Tsazor builds in
  (routing, forms, validation, toasts, dialogs) belong in the comparison.
