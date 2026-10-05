# Design: lazy loading per route or feature (E5)

Status: **approved** (2026-10-05, D-L1…D-L5 as proposed). Roadmap step 4.

## Today

The Vite plugin generates `virtual:tsazor-routes` with a static `import` per `@page` component
(and its `@layout`). Every page is in the main bundle; Vite splits nothing. Fine for small apps;
a back-office with 80 pages loads all of them before the first render.

## What Blazor has

Blazor WebAssembly lazy-loads *assemblies*: the `Router` gets `OnNavigateAsync`
(`EventCallback<NavigationContext>`, with `Path` and a `CancellationToken`), the app loads the
assemblies a path needs there and adds them to `AdditionalAssemblies`; while the callback runs,
the router renders its `<Navigating>` fragment. Route templates come from the loaded assemblies.

Tsazor has no assemblies, but ES modules: Vite already code-splits every dynamic `import()`. The
route *templates* are known at build time (the plugin scans `@page`), so the manifest can carry
them without loading the page.

## Proposal

**1. Parity first: `OnNavigateAsync` and `<Navigating>` on `Router`.** Same contract as Blazor:
`OnNavigateAsync` receives `NavigationContext { path, signal }` (`signal`: an `AbortSignal` in place
of the `CancellationToken`, aborted when a newer navigation starts); the router renders
`Navigating` while it runs and the matched page after it. Useful on its own (prefetch data,
redirects) and the hook lazy routes build on.

**2. Lazy manifest entries.** `RouteEntry` gets `load?: () => Promise<RouteComponents>` as an
alternative to `type` (and `layout`):

```ts
{ template: "/admin/orders", load: () => import("./Pages/Admin/Orders.tsazor").then(...), authorize: {...} }
```

The router matches templates as before; for a lazy entry it awaits `load()` once (cached), shows
`Navigating` meanwhile, then renders. `authorize` stays static in the manifest, so
`AuthorizeRouteView` decides before anything is loaded (no code for a page the user may not see).

**3. Opt-in in the Vite plugin, by glob.**

```ts
tsazor({ lazyRoutes: ["src/Pages/Admin/**"] })   // a feature folder
tsazor({ lazyRoutes: true })                       // every page
```

Pages matched by a glob get `load` entries; the rest stays eager (the start page should be). Each
lazy page becomes its own chunk; Vite shares common code between chunks. Grouping a feature into
one chunk is Vite's `build.rollupOptions.output.manualChunks` — documented, not reinvented.

**4. A failed chunk load** (typical after a deploy: the old `index.html` asks for a chunk hash that
no longer exists) becomes a full page load of the target URL, once — the new `index.html` then has
the new hashes. A second failure for the same URL is an error of the router, handled like any
component failure (an `ErrorBoundary` around the router shows it).

**5. Preloading** (not in this step): `NavigationManager`-independent `preloadRoute(path)` and an
optional NavLink prefetch on hover can follow; the manifest shape already allows it.

## Decisions (approved 2026-10-05)

- **D-L1 — Granularity:** one chunk per lazy page, feature grouping via Vite's `manualChunks`.
  *Alternative:* the plugin groups per folder itself. **Proposal: per page + docs.**
- **D-L2 — Default:** eager; lazy is opt-in per glob (`lazyRoutes`). *Alternative:* lazy by default
  except the `/` page. **Proposal: opt-in** (Blazor's default is eager too; no surprise loading
  states).
- **D-L3 — `OnNavigateAsync`/`Navigating`:** implement Blazor's API as is (with `AbortSignal`).
  **Proposal: yes**, before the lazy entries.
- **D-L4 — Layouts:** a lazy page's `@layout` is loaded with the page (both in `load`); a layout used
  by eager pages stays in the main chunk anyway (Vite dedupes). **Proposal: yes.**
- **D-L5 — Failed chunk:** one full reload to the target URL, then an error. **Proposal: yes.**

## Tests and docs

- Runtime: `OnNavigateAsync` ordering and cancellation, `Navigating` shown/hidden, lazy entry loaded
  once, authorize decided before load, failed load → reload once.
- Vite plugin: manifest with `load` for globbed pages, eager otherwise; a build test that a lazy page
  lands in its own chunk.
- An app check: the pizza app or the gallery with one lazy feature, in CI (`verify`).
- Docs: the routing section of the language reference, the patterns guide (E4) — when to split.
