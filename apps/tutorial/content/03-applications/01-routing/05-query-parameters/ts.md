---
title: Query parameters
focus: Orders.tsazor
gate: click nav a:nth-child(2); click .filters a:nth-child(2)
---

The orders page gained filter links: All, Open, Picked up. Each is the same
route — `/orders` — with a *query string* tacked on: `/orders?state=open`.
Click Open: the URL changes, the page re-renders… and the list ignores it.
The route has no `{state}` segment, and the page doesn't read the query.

That's the point of query strings: data that isn't a path of its own. Filters,
search terms, page numbers — present in the address, shareable in a link,
optional on every view. A page reads them with the
`@SupplyParameterFromQuery` decorator:

```tsazor
@Parameter() @SupplyParameterFromQuery() state: string | null = null;
```

Two decorators stack: `@Parameter()` because the value arrives as a page
parameter, `@SupplyParameterFromQuery()` because its source is the query
string. Both are field decorators, so the import at the top of the file is
needed — free names are never auto-imported:

```tsazor
@import { SupplyParameterFromQuery } from "@tsazor/runtime"
```

With `state` filled from `?state=…`, the filter is two lines — `shown` becomes
a getter over the list, the markup loops over it. Click through the filters:
the URL drives the list, "All" (no query string) supplies `null`, and the
browser's back button steps through the filters, because each click pushed a
history entry.

The details:

- The query key defaults to the field name; `@SupplyParameterFromQuery({
  name: "st" })` reads `?st=…` instead. Keys match case-insensitively.
- A value converts like a route value when you declare the type:
  `@SupplyParameterFromQuery({ type: "int" }) page: number | null = null`
  gives you a real number (`"string"`, `"int"`, `"long"`, `"bool"`, `"double"`,
  `"float"`, `"decimal"`, `"datetime"`, `"guid"`).
- A repeated key can supply an array:
  `@SupplyParameterFromQuery({ multiple: true }) tags: string[] | null =
  null` turns `?tags=rye&tags=wheat` into `["rye", "wheat"]`; without
  `multiple`, the first value wins.
- An absent key supplies `null` — declare the field nullable, as the `string |
  null` above.