---
title: Route parameters
focus: Order.tsazor
gate: click nav a:nth-child(2); click .orders a
---

`Orders.tsazor` lists the day's orders, each linking to `/orders/101`,
`/orders/102` and so on. Click one: "Nothing here." `Order.tsazor` exists — it
even prints `Order #@id` — but it has no `@page`, so the router doesn't know it
*is* a page. Its `[Parameter]`-style field sits unused:

```tsazor
@code {
    @Parameter() id = 0;
}
```

One page behind many URLs, and the URLs differ only in the order's number —
say exactly that in the route template:

```tsazor
@page "/orders/{id:int}"
```

Add the line to `Order.tsazor`. `{id}` is a route parameter; the `:int` suffix
is a constraint — the segment must be a whole number and arrives as a number,
not a string. The value lands in the page's `@Parameter() id`, matched by
name, case-insensitively.

> **Coming from Blazor:** this is `[Parameter] public int Id { get; set; }`
> plus Blazor's `@page "/orders/{Id:int}"`, one difference in spirit — the
> route value is supplied as an attribute, so the field is `@Parameter()`
> like any component parameter, and the `:int` conversion is what makes the
> value a real number. The constraint set matches ASP.NET's: `int`, `long`,
> `bool`, `double`, `float`, `decimal`, `datetime`, `guid`, `alpha`,
> `alphaNumeric`, `regex(…)`, plus optional segments (`{page:int?}` — an
> absent segment supplies null, so the field is nullable, exactly Blazor's
> rule for optional route parameters) and the catch-all `{*path}` (slashes
> included). An unknown constraint fails at startup, like an invalid
> template. Same-instance behavior matches Blazor too: navigating between
> two orders keeps the page component and updates `id`.