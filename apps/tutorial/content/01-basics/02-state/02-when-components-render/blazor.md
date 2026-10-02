---
title: When a component renders
focus: App.tsazor
gate: click button; wait 1100
---

The rendering rules are Blazor's: a component renders after its event handlers, after its
lifecycle methods, and when its parent passes it new parameters. Everything else — timers,
callbacks, messages from a socket — needs an explicit nudge.

Click **Start**. The button gets disabled (that change happened in the handler), but the
seconds stay at zero, although `this.seconds++` runs every second. Nothing triggered a
render. You know the fix:

```ts
setInterval(() => {
    this.seconds++;
    this.stateHasChanged();
}, 1000);
```

As in Blazor, `stateHasChanged()` queues a render rather than rendering immediately, so
several calls in a row cost one render, and `shouldRender()` is consulted first.

> **Coming from Blazor:** it's `stateHasChanged()` — camelCase, like every Tsazor API — and
> there's no `InvokeAsync` around it. Blazor needs `InvokeAsync(StateHasChanged)` when a
> callback arrives on another thread; JavaScript has a single thread and no
> synchronization context, so you call `this.stateHasChanged()` directly from any callback.
