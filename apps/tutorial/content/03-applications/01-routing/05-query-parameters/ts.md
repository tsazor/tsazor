---
title: Query parameters
keywords: query parameters, @SupplyParameterFromQuery(), query string
focus: Orders.tsazor
gate: click nav a:nth-child(2); click .filters a:nth-child(2)
---

The orders page now has filter links: All, Open, Picked up. They all go to `/orders`, with a
**query string** added — `/orders?state=open`. Click Open: the URL changes, but the list
doesn't, because the page never reads the query.

Query strings are the place for things like filters, search terms and page numbers. They're
optional, and they still end up in the URL, so a link keeps them. To read one, add a
field with a decorator:

```tsazor
@SupplyParameterFromQuery() state: string | null = null;
```

`@SupplyParameterFromQuery()` fills `state` from `?state=…`, and fills it again when the
URL changes. It works in any component, not only in a page. Like any value you use in code,
the decorator needs an import at the top of the file:

```tsazor
@import { SupplyParameterFromQuery } from "@tsazor/runtime"
```

Now filter the list with a getter, and loop over that instead of `orders`:

```ts
get shown() {
    return this.state === null ? this.orders : this.orders.filter((order) => order.state === this.state);
}
```

Click through the filters. The list follows the URL, and the back button steps back through
your clicks. Without a `?state=` in the URL, `state` is `null` — that's why the field is
nullable.

The decorator takes options when you need them: `name` reads a different key,
`type: "int"` converts the value to a number, and `multiple: true` collects a repeated key
into an array.
