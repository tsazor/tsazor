---
title: DOM events
keywords: events, PointerEvent, @onclick, KeyboardEvent
focus: App.tsazor
gate: pointer .area pointermove
---

You've already used `@onclick`. Any DOM event works the same way: `@on` followed by the
event's name, with a method of the component as the handler. Track the pointer:

```tsazor
<div class="area" @onpointermove="move">
    The pointer is at @x × @y
</div>
```

```ts
move(event: PointerEvent) {
    this.x = event.clientX;
    this.y = event.clientY;
}
```

Move the pointer over the preview. The handler receives the browser's own event object — a
real `PointerEvent`, with everything MDN documents for it. There's no wrapper and no
synthetic event system: the listener sits directly on the `<div>`, and your method is called
from it.

The parameter is optional. A handler that doesn't need the event just leaves it out, like
`increment()` in the earlier lessons. Annotate it with the DOM's event type (`PointerEvent`,
`KeyboardEvent`, `InputEvent`…) and the body is checked against the DOM type definitions
like any other code. The annotation is your promise, though — the check doesn't compare it
with the event name, so pick the type that matches.

After the handler, the component renders — that's the rule from the state chapter, and it
holds for every event.
