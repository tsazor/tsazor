---
title: The animate directive
keywords: @animate, flip, FLIP, Animate, @tsazor/runtime/animate, reordering
focus: TodoList.tsazor
gate: check .todos input; look
---

When a todo leaves or arrives, the remaining items jump. `@animate="flip"` makes them glide to
their new places:

```tsazor
@import { flip } from "@tsazor/runtime/animate"
```

```tsazor
<li @key="todo.id" @in="receive({ key: todo.id })" @out="send({ key: todo.id })" @animate="flip">
```

Tsazor measures each row before and after the render (First, Last), and `flip` animates the
difference (Invert, Play). Only on the rows of a keyed loop — an element directly inside
`@foreach` that has `@key` (TZS008 elsewhere).

> **Coming from Blazor:** `@key` is the same as in Blazor; `@animate` builds on exactly the row
> identity it gives the diff.
