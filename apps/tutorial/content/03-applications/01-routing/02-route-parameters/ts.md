---
title: Route parameters
focus: Order.tsazor
gate: click nav a:nth-child(2); click .orders a
---

The orders page lists the day's orders, each linking to `/orders/101`,
`/orders/102` and so on. Click one: "Nothing here." `Order.tsazor` exists — it
even prints `Order #@id` — but it has no `@page`, so the router doesn't know it
*is* a page. `@Parameter() id = 0` sits unused.

An order page is one page behind many URLs, and the URLs differ only in the
order's number. Say exactly that in the route template:

```tsazor
@page "/orders/{id:int}"
```

Add the line to `Order.tsazor`. `{id}` is a *route parameter*: whatever sits at
that spot in the URL is handed to the page. The `:int` suffix is a *constraint*:
the segment must be a whole number, and it arrives as a real number, not a
string — `/orders/bread` doesn't match this route at all.

The value lands in a field of the same name, declared `@Parameter()`:

```tsazor
@code {
    @Parameter() id = 0;
}
```

Click Marta's order: the URL becomes `/orders/101`, the router matches, and
`id` is `101` when the page renders. Names match case-insensitively — `@page
"/orders/{Id:int}"` would find the same `id` field.

Constraints you can use: `int`, `long`, `bool`, `double`, `float`, `decimal`,
`datetime`, `guid`, `alpha`, `alphaNumeric` and `regex(…)`. A parameter can be
optional — `{page:int?}` matches both `/orders` and `/orders/2` — and when the
URL doesn't carry the segment, the page receives `null`, so the field must be
nullable: `@Parameter() page: number | null = null`. A catch-all `{*path}`
swallows the rest of the URL, slashes included: `/files/{*path}` matches
`/files/photos/2024/loaf.jpg`. A template with an unknown constraint is
rejected at startup, not at click time.