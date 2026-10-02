---
title: NavLink
focus: App.tsazor
gate: click nav a:nth-child(2)
---

The menu is three plain anchors. Click Orders: the page changes, the URL
changes — and nothing in the menu says *where you are*. A menu should mark the
active entry, and the router already knows the answer, so use a link that asks
it:

```tsazor
<NavLink href="/orders">Orders</NavLink>
```

Replace all three anchors in `App.tsazor`. A `NavLink` renders an ordinary
`<a>`, navigates like one, and re-checks the URL on every navigation: while the
current location matches its `href`, the anchor carries the class `active`
plus `aria-current="page"` — the standard accessibility signal for "this is the
current page". The app's stylesheet bolds `.menu .active`, so the entry lights
up.

Matching is *prefix* by default: `/orders` covers `/orders` itself and
everything below it (`/orders/101` stays on the Orders tab's watch — useful
for section links). But every URL starts with `/`, so a prefix link to `/`
would be active on *every* page. The Home link must match the whole URL only:

```tsazor
<NavLink href="/" Match="@NavLinkMatch.All">Home</NavLink>
```

`NavLinkMatch` is a value that lives in the runtime package, and free names in
markup are never auto-imported — hence the first line of the file:

```tsazor
@import { NavLinkMatch } from "@tsazor/runtime"
```

Two more parameters when you need them: `ActiveClass` overrides the `"active"`
default, `CssClass` puts static classes on the anchor (`CssClass="tab"` gives
you `class="tab"` when idle and `class="tab active"` when active). The
comparison is case-insensitive and ignores the URL's query and fragment, so
`/orders?state=open` still counts as being on `/orders`.