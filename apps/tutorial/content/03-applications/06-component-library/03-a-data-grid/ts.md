---
title: A data grid
keywords: DataGrid, PropertyColumn, Sortable, Format, Paginator, PaginationState, QuickGrid
focus: App.tsazor
---

Today's twelve orders, in a `DataGrid`. Each `PropertyColumn` shows one property of the row; its
title is the property's name, and the total shows all its decimals. Let's make it a grid you'd
ship.

Give the columns titles, make two of them sortable and format the money:

```tsazor
<PropertyColumn Property="(o) => o.id" Title="#" />
<PropertyColumn Property="(o) => o.customer" Title="Customer" Sortable="@true" IsDefaultSortColumn="@true" />
<PropertyColumn Property="(o) => o.total" Title="Total" Format="(v) => v.toFixed(2)" Align="end" Sortable="@true" />
```

Click the Customer and Total headers: the grid sorts, and `aria-sort` tells a screen reader how.

`o` in `(o) => o.customer` is an `Order` — the grid passes its row type to the columns inside it,
and `v` in `Format` is the type of the property, a number here. Write `o.custmer` and the editor
(and `tsazor check`) says so.

Twelve rows are fine; a thousand aren't. Page them — a `PaginationState` shared by the grid and a
`Paginator`:

```tsazor
@import { PaginationState } from "@tsazor/bootstrap"
```

```tsazor
<DataGrid Items="@orders" Pagination="@pagination" AriaLabel="Today's orders">…</DataGrid>
<Paginator State="@pagination" />
```

```ts
pagination = new PaginationState();

override onInitialized() {
    this.pagination.itemsPerPage = 5;
}
```

> **Tsazor chooses the QuickGrid shape:** columns as child components, typed by the grid, sorting
> and paging in the grid. For server data, `ItemsProvider` asks your code for one page at a time
> (with the sort and an `AbortSignal`), and `Virtualize="true"` renders only the rows in view.
