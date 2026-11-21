---
title: Hash routing
keywords: hash routing, #/, static hosting
focus: Program.ts
gate: click nav a:nth-child(2); click .filters a:nth-child(2)
---

Blazor routes by path, so the server must answer every deep link with `index.html`. Where
you can't configure that (a static host such as GitHub Pages, an app in someone else's
iframe), switch Tsazor to hash routing in `Program.ts`:

```ts
createTsazorApp({ root: App, routing: { mode: "hash" } });
```

The route moves into the fragment: `/#/orders?state=open`. `NavLink` renders `#/…`
hrefs by itself. Plain anchors must be written as `#/…` (other hrefs are real document
loads), so fix the filter links in `Orders.tsazor` and the home link in `Lost.tsazor`.

> **Coming from Blazor:** this is a Tsazor extension; Blazor has no hash mode. Everything
> built on `NavigationManager` keeps working: `uri` is the *logical* address
> (`…/orders?state=open`), so `@page` templates, `[SupplyParameterFromQuery]`,
> `NavigationLock` and `@authorize` behave as in path mode.
