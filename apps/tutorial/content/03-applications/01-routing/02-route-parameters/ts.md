---
title: Route parameters
keywords: route parameters, route constraints, catch-all, @page
focus: Order.tsazor
gate: click nav a:nth-child(2); click .orders a
---

The orders page links to `/orders/101`, `/orders/102` and so on. Click one: "Nothing
here." `Order.tsazor` is ready to show an order, but it has no `@page`, so the router
doesn't know it's a page.

One page should serve all of these URLs. Add a route with a placeholder for the number:

```tsazor
@page "/orders/{id:int}"
```

`{id}` is a **route parameter**: whatever sits at that spot in the URL is passed to the
page, into the parameter of the same name — the `@Parameter() id` that's already in the
file. Click Marta's order again: the page shows `Order #101`.

The `:int` part is a **constraint**. The segment must be a whole number, and it arrives as a
number, not a string. `/orders/bread` doesn't match this route at all.

A few more forms you'll meet:

- Other constraints work the same way — `bool`, `guid` or `datetime`, for example.
- `{page:int?}` makes a segment optional. When it's missing, the page gets `null`, so
  declare the field as `page: number | null = null`.
- `{*path}` catches the rest of the URL, slashes included.
