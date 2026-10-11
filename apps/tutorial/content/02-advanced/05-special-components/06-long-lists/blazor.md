---
title: Long lists
keywords: Virtualize, virtualization, long list, ItemSize, OverscanCount
focus: App.tsazor
---

Blazor 11's `Virtualize<TItem>`. Replace the `@foreach` over the 10,000 orders with:

```tsazor
<Virtualize Items="@orders" Context="order">
    <div class="order">…</div>
</Virtualize>
```

As in Blazor 11, the rows are measured, so rows of different heights work and `ItemSize` is only
the first estimate. `OverscanCount`, `MaxItemCount`, `Placeholder`, `EmptyContent` and
`SpacerElement` are the same too.

> **Coming from Blazor:** `Items` is an array. An `ItemsProvider` gets `request.signal`, an
> `AbortSignal`, where Blazor passes a `CancellationToken`, and returns a `Promise`. `ItemComparer`
> is a function, `(a, b) => boolean`. `ScrollToItemAsync` is `scrollToItemAsync(index, signal?)`.
