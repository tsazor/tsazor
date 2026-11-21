---
title: Waiting for navigation
keywords: OnNavigateAsync, Navigating, NavigationContext, lazyRoutes, lazy loading, loading indicator, CancellationToken
focus: App.tsazor
gate: click nav a:nth-child(2); look
---

Blazor's `Router.OnNavigateAsync` and `<Navigating>`, unchanged. Click **Orders**: the router
awaits `prepare` before it renders the page, and without `<Navigating>` the previous page simply
stays. Add the fragment next to `<Found>` in `App.tsazor`:

```tsazor
<Navigating>
    <p class="navigating" role="status">Loading…</p>
</Navigating>
```

`NavigationContext` has `path` and `signal` — an `AbortSignal` in place of the
`CancellationToken`, aborted when a newer navigation starts. Pass it to `fetch`.

> **Coming from Blazor:** in Blazor WebAssembly, `OnNavigateAsync` is where you lazy-load
> assemblies (`LazyAssemblyLoader`) and add them to `AdditionalAssemblies`. Tsazor has no
> assemblies but ES modules: the Vite plugin's `lazyRoutes` option
> (`tsazor({ lazyRoutes: ["src/Pages/Admin/**"] })`) turns matching pages into chunks loaded on the
> first visit, and the router shows `<Navigating>` meanwhile — the route templates and `@authorize`
> requirements stay known up front. No hook to write.

> **Coming from Blazor:** without `<Navigating>`, Tsazor keeps the previous page until the new one
> has also finished its `OnInitializedAsync` (at most a second), as enhanced navigation does in
> static SSR; interactive Blazor would show the half-loaded page. `routing.holdPreviousPage: false`
> in `createTsazorApp` turns it off.
