---
title: Query parameters
focus: Orders.tsazor
gate: click nav a:nth-child(2); click .filters a:nth-child(2)
---

The orders page has filter links — `/orders`, `/orders?state=open`,
`/orders?state=picked-up`. The URL changes on click, the list doesn't: nothing
reads the query string. That's `[SupplyParameterFromQuery]`'s job:

```tsazor
@Parameter() @SupplyParameterFromQuery() state: string | null = null;
```

with the import the field decorators need:

```tsazor
@import { SupplyParameterFromQuery } from "@tsazor/runtime"
```

Then a `shown` getter filters the list and the markup loops over it.

> **Coming from Blazor:** two differences. First, the stacking: Blazor
> supplies query values through an internal cascading provider, so the
> property only carries `[SupplyParameterFromQuery]`; here the values ride
> the same attribute supply the route values use, so the field is
> `@Parameter()` too — the runtime throws a clear error if you forget it.
> Second, the import: the decorator is a value, not a component, so it needs
> the explicit `@import` (no `_Imports` magic). The rest matches: keys are
> case-insensitive, `Name` is the `name` option, the absent key supplies
> `null`, and the type option takes the route-constraint names (`type: "int"`
> instead of a `Type` property — no reflection at runtime). A repeated key
> arrays with `multiple: true` (Blazor arrays when the property is an array
> type; TS types don't survive to runtime, so the decorator says so).