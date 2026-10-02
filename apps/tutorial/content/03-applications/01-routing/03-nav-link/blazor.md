---
title: NavLink
focus: App.tsazor
gate: click nav a:nth-child(2)
---

Three plain anchors, and nothing in the menu says where you are. You know the
fix — it's Blazor's `NavLink`:

```tsazor
<NavLink href="/orders">Orders</NavLink>
<NavLink href="/" Match="@NavLinkMatch.All">Home</NavLink>
```

Replace all three anchors. While the current location matches, the anchor gets
`class="active"` (this app's CSS bolds it) and `aria-current="page"`.

> **Coming from Blazor:** `Match` defaults to `NavLinkMatch.Prefix` and a
> prefix link to `/` matches everything — the Home link needs `All`, same
> trap as in Blazor. One extra line, because `NavLinkMatch` is a value, not a
> component: free names in markup are never auto-imported from the runtime
> package, so the file starts with `@import { NavLinkMatch } from
> "@tsazor/runtime"` (in Blazor the type is just there via `_Imports`).
> Matching follows .NET 8 semantics exactly — case-insensitive, trailing
> slashes on the href are tolerated, `All` ignores the query and fragment.
> The remaining parameters are the ones you know: `ActiveClass` (default
> `"active"`), `CssClass` for static classes.