---
title: Route parameters
focus: Order.tsazor
gate: click nav a:nth-child(2); click .orders a
---

Click an order: "Nothing here." `Order.tsazor` has a parameter `id` but no `@page`. Give it
the route you'd write in Blazor:

```tsazor
@page "/orders/{id:int}"
```

Click the order again: `Order #101`. The route value lands in `@Parameter() id`, matched by
name and case-insensitively, and thanks to `:int` it arrives as a number.

> **Coming from Blazor:** templates and constraints are ASP.NET's — `int`, `guid`,
> `datetime`, `regex(…)` and the rest — including optional segments (`{page:int?}`, which
> supply `null`, so the field must be nullable) and catch-alls (`{*path}`). An unknown
> constraint fails at startup. Navigating from one order to another keeps the page instance
> and only updates `id`, as in Blazor.
