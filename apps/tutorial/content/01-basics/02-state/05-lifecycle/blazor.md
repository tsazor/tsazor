---
title: Lifecycle
focus: Timer.tsazor
gate: wait 1100
---

The lifecycle is `ComponentBase`'s, method for method: `onInitialized`, `onParametersSet`,
`onAfterRender(firstRender)`, `shouldRender` — and disposal when the component leaves the
tree.

`App` shows and hides a `Timer` (with `@if`, the next chapter's topic). Make the timer count
by starting an interval in `Timer.tsazor`:

```ts
override onInitialized() {
    this.interval = setInterval(() => {
        this.seconds++;
        this.stateHasChanged();
    }, 1000);
}
```

Hide the timer and show it again: a fresh instance starts at zero, while the old interval
keeps running in the background. Stop it when the component is disposed:

```ts
dispose() {
    clearInterval(this.interval);
}
```

> **Coming from Blazor:** there are no separate `…Async` methods. A hook may return a
> promise — `override async onInitialized()` *is* `OnInitializedAsync`, rendered around the
> `await` the way Blazor does it. Disposal needs no `@implements IDisposable`: the renderer
> calls `dispose()` (or `disposeAsync()`, which takes precedence) if the component has one.
> One documented difference: within a render batch, `onAfterRender` runs for children before
> their parents.
