---
title: Deferred transitions
keywords: crossfade, send, receive, deferred transitions, fallback
focus: TodoList.tsazor
gate: check .todos input; look
---

Tick a todo: it vanishes from one list and pops up in the other. Nobody can follow that with
their eyes. It should travel across.

That takes two transitions working together: the outro of the item that leaves "todo" has to
know where its twin enters "done". `motion.ts` already creates such a pair with `crossfade`:
`send` for the leaving side, `receive` for the entering side. Use them in `TodoList.tsazor`:

```tsazor
@import { send, receive } from "./motion"
```

```tsazor
<li @key="todo.id" @in="receive({ key: todo.id })" @out="send({ key: todo.id })">
```

Tick a few todos, and untick them again. The `key` pairs the two elements: an item sent with
key 3 flies to the item received with key 3. When there is no partner — an item that is only
removed or only added — the `fallback` in `motion.ts` plays instead, a scale-and-fade.

This works because a transition may return its config **later**: `send` and `receive` first
note which element they got, and only once every transition of the render has done so, they
look for their partner and compute the flight. That's a **deferred transition**. `duration` can
also be a function of the distance, `(distance) => Math.sqrt(distance * 200)`, so long flights
take longer.
