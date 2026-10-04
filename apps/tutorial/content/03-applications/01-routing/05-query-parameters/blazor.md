---
title: Query parameters
keywords: query parameters, @SupplyParameterFromQuery(), query string
focus: Orders.tsazor
gate: click nav a:nth-child(2); click .filters a:nth-child(2)
---

The filter links add `?state=open` and `?state=picked-up` to `/orders`, but the list doesn't
change: nothing reads the query string. That's what `[SupplyParameterFromQuery]` is for:

```tsazor
@import { SupplyParameterFromQuery } from "@tsazor/runtime"
```

```ts
@Parameter() @SupplyParameterFromQuery() state: string | null = null;
```

Then add a `shown` getter that filters `orders` by `state`, and loop over it in the markup.

> **Coming from Blazor:** two differences. The field also needs `@Parameter()`, because
> query values arrive the same way route values do (the runtime throws a clear error if you
> forget it). And the decorator is a value, so it needs the `@import`. The options are
> Blazor's in lowercase: `name`, plus `type: "int"` instead of the property type, and
> `multiple: true` for arrays — TypeScript types don't exist at runtime.
