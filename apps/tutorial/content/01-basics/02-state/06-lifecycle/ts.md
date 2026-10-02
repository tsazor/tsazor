---
title: Lifecycle
focus: Timer.tsazor
gate: wait 1100
---

A component has a life: it's created, rendered (often many times) and eventually removed.
`ComponentBase` — the base class of every component — calls a few methods along the way,
and you override the ones you need:

| Method | When it runs |
|---|---|
| `onInitialized()` | once, after the first parameters arrived, before the first render |
| `onParametersSet()` | every time the parent passes parameters (including the first time) |
| `onAfterRender(firstRender)` | after each render has reached the DOM — `firstRender` is `true` once |
| `dispose()` | when the component is removed |

Here, `App` shows and hides a `Timer` (the `@if` is the next chapter's topic). The timer
doesn't count yet. Start an interval when it's created, in `Timer.tsazor`:

```ts
override onInitialized() {
    this.interval = setInterval(() => {
        this.seconds++;
        this.stateHasChanged();
    }, 1000);
}
```

`override` is TypeScript's way of saying "this replaces a base class method" — the type
check then verifies that the base class really has a method of that name, so a typo like
`onInitialised` can't slip through.

Hide the timer and show it again: it starts at zero, because it's a new component. But the
old interval is still running — nobody stopped it. That's what `dispose()` is for:

```ts
dispose() {
    clearInterval(this.interval);
}
```

Release everything a component started in `dispose()`: intervals, event listeners on
`window`, subscriptions — unless `this.track` or `this.disposeSignal` from the previous
lesson already take care of them. The interval here could be
`this.track((signal, notify) => { … })` as well. And use `onAfterRender` when you need the
actual DOM elements — we'll get to that in the chapter on element references.
