---
title: NavLink
keywords: NavLink, active, NavLinkMatch, aria-current
focus: App.tsazor
gate: click nav a:nth-child(2)
---

The menu doesn't show where you are. Replace the three anchors with `NavLink`s, just as in
Blazor:

```tsazor
<NavLink href="/" Match="@NavLinkMatch.All">Home</NavLink>
<NavLink href="/orders">Orders</NavLink>
```

The active link gets `class="active"` (this app's CSS makes it bold) and
`aria-current="page"`. Home needs `NavLinkMatch.All` for the usual reason: as a prefix, `/`
matches every page.

> **Coming from Blazor:** one extra line. `NavLinkMatch` is a value, not a component, and
> values are never auto-imported, so the file starts with
> `@import { NavLinkMatch } from "@tsazor/runtime"`. Everything else follows .NET 8:
> case-insensitive matching, `ActiveClass` and `CssClass`.
