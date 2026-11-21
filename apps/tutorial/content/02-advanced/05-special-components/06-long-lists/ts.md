---
title: Long lists
keywords: Virtualize, virtualization, long list, ItemSize, OverscanCount
focus: App.tsazor
---

The bakery's order history has 10,000 orders, and the page renders a row for each of them: it
takes a while to show, and scrolling feels heavy. Render only the rows you can see. Replace the
`@foreach` with `Virtualize`:

```tsazor
<Virtualize Items="@orders" Context="order">
    <div class="order">…</div>
</Virtualize>
```

`Virtualize` renders the rows in view and a few above and below them (`OverscanCount`). Two empty
spacers stand in for the rest, so the scrollbar still matches all 10,000 orders. It needs an
element that scrolls: `.history` has a height and `overflow-y: auto`.

The rows don't need the same height. An order with a note is taller. `Virtualize` measures the
rows it renders and sizes the spacers from their average, so `ItemSize` is only its first guess.
