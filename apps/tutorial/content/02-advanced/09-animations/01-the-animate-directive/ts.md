---
title: The animate directive
keywords: @animate, flip, FLIP, Animate, @tsazor/runtime/animate, reordering
focus: TodoList.tsazor
gate: check .todos input; look
---

The todos fly between the lists now. But watch the items that stay: when one leaves, the rest
jump up to close the gap, and when one arrives, the others jump down to make room. The flight
is smooth, the landing isn't.

**Animations** fix that. They play when an item of a keyed list moves to a new place. Add
`flip` to the list items:

```tsazor
@import { flip } from "@tsazor/runtime/animate"
```

```tsazor
<li @key="todo.id" @in="receive({ key: todo.id })" @out="send({ key: todo.id })" @animate="flip">
```

Tick a few todos. The other items now glide to their new places. FLIP stands for First, Last,
Invert, Play: Tsazor measures where each item is before the render (first) and after it
(last), and `flip` slides it from the old place to the new one. Like transitions, `flip` takes
parameters: `@animate="flip({ duration: 200 })"`.

`@animate` only works on the rows of a keyed loop — an element directly inside `@foreach` with
a `@key` — because only there does an item have a place to move from. Anywhere else, the check
reports it.
