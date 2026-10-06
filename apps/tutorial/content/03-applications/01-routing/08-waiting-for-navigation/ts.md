---
title: Waiting for navigation
keywords: OnNavigateAsync, Navigating, NavigationContext, lazyRoutes, lazy loading, loading indicator
focus: App.tsazor
gate: click nav a:nth-child(2); look
---

Click **Orders**. Nothing happens for a second and a half, then the page appears. The router
waits for `prepare` before it shows the page: `OnNavigateAsync` runs before every navigation
renders, and the page only appears once it has finished. That's the place to load what a page
needs first — data, or the page's own code.

Waiting is fine; waiting without a sign is not. Give the router something to show meanwhile —
add a `<Navigating>` block next to `<Found>` in `App.tsazor`:

```tsazor
<Navigating>
    <p class="navigating" role="status">Loading…</p>
</Navigating>
```

Click **Orders** again: the message shows until `prepare` is done. Without `<Navigating>`, the
previous page simply stays — which can be right, too, for very short waits.

`prepare` gets a `NavigationContext`: `context.path` is where the user is going, and
`context.signal` is aborted when they click somewhere else before you're done — pass it to
`fetch` to cancel the request.

**Loading pages on demand.** The most common reason to wait is code. A large app doesn't need its
admin pages on the start page; the Vite plugin can split them off:

```ts
// vite.config.ts
tsazor({ lazyRoutes: ["src/Pages/Admin/**"] })
```

Each matching page becomes its own file, loaded on the first visit, and the router shows your
`<Navigating>` block while it loads — no `OnNavigateAsync` needed for that. Keep the start page and
the everyday pages eager; split what most visitors never open.
