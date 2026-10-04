---
title: NavLink
keywords: NavLink, active, NavLinkMatch, aria-current
focus: App.tsazor
gate: click nav a:nth-child(2)
---

Click Orders. The page and the URL change, but the menu doesn't show where you are. A
`NavLink` can do that for you, because it knows the current URL:

```tsazor
<NavLink href="/orders">Orders</NavLink>
```

Replace the three anchors in `App.tsazor` with `NavLink`s. Each one renders an ordinary
`<a>`. While the URL matches its `href`, the link gets the class `active` (the stylesheet
makes it bold) and `aria-current="page"`, which tells screen readers it's the current page.

Now click Orders again — Home lights up too. By default a `NavLink` matches by *prefix*:
`/orders` is also active on `/orders/101`, which is what you want for a section. But every
URL starts with `/`, so Home is always active. Tell it to match the whole URL:

```tsazor
<NavLink href="/" Match="@NavLinkMatch.All">Home</NavLink>
```

`NavLinkMatch` is an ordinary value, not a component, so you import it at the top of the
file:

```tsazor
@import { NavLinkMatch } from "@tsazor/runtime"
```

If you need different classes, `ActiveClass` replaces `active`, and `CssClass` adds classes
that are always there.
