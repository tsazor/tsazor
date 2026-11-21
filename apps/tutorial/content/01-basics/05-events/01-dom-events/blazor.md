---
title: DOM events
keywords: events, PointerEvent
focus: App.tsazor
gate: pointer .area pointermove
---

`@on{event}` attributes work as in Blazor, for every DOM event. Track the pointer:

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

Move the pointer over the preview. The component re-renders after each event, as you'd
expect.

> **Coming from Blazor:** the handler receives the browser's native event — a DOM
> `PointerEvent`, not Blazor's `PointerEventArgs` — so the property names are the DOM's
> (`clientX`, `key`, `target`), and everything else on the event is available too. There
> is no event delegation and no interop hop: the listener is attached directly to the
> element and runs your method synchronously, inside the browser's event dispatch.
