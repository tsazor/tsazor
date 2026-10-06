---
title: Deferred transitions
keywords: crossfade, send, receive, deferred transitions, fallback
focus: TodoList.tsazor
gate: check .todos input; look
---

Tick a todo: it jumps between the lists. `crossfade` (in `motion.ts`) makes a `send`/`receive`
pair that lets it fly across instead:

```tsazor
@import { send, receive } from "./motion"
```

```tsazor
<li @key="todo.id" @in="receive({ key: todo.id })" @out="send({ key: todo.id })">
```

The `key` pairs the leaving element with the entering one; without a partner the `fallback`
plays. This works because a transition can return a function instead of its config: Tsazor
calls it once all transitions of the render are known — a **deferred transition**.

> **Coming from Blazor:** the two lists are two component instances, each with its own render.
> The pairing happens across them, at the end of the render batch.
