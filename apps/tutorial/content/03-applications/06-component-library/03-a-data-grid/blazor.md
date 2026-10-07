---
title: A data grid
keywords: DataGrid, PropertyColumn, Sortable, Format, Paginator, PaginationState, QuickGrid
focus: App.tsazor
---

The `DataGrid` is QuickGrid: `PropertyColumn`, `TemplateColumn`, `Paginator` and `PaginationState`.
Give the columns titles, sorting and a format:

```tsazor
<PropertyColumn Property="(o) => o.id" Title="#" />
<PropertyColumn Property="(o) => o.customer" Title="Customer" Sortable="@true" IsDefaultSortColumn="@true" />
<PropertyColumn Property="(o) => o.total" Title="Total" Format="(v) => v.toFixed(2)" Align="end" Sortable="@true" />
```

and page it with a shared state: `@import { PaginationState } from "@tsazor/bootstrap"`,
`<DataGrid … Pagination="@pagination">` with `<Paginator State="@pagination" />` below, and in
`@code`: `pagination = new PaginationState();`, `itemsPerPage = 5` in `onInitialized`.

> **Coming from Blazor:** `Format` is a function instead of a .NET format string
> (`Format="(v) => v.toFixed(2)"` for `Format="F2"`). The columns infer the row type from the grid —
> Blazor's `[CascadingTypeParameter]`, so `o` is an `Order` without `TGridItem="Order"`.
> `ItemsProvider` gets an `AbortSignal` where QuickGrid passes a `CancellationToken`.
