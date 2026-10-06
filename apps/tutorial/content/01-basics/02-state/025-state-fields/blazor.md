---
title: Fields that render
keywords: @State, State, accessor, automatic rendering, shallow state
focus: App.tsazor
refactor: true
gate: click button; wait 1100
---

Instead of calling `stateHasChanged()` after every change in a callback, mark the field:

```ts
@State() accessor seconds = 0;
```

```ts
setInterval(() => this.seconds++, 1000);
```

Assigning a `@State` field queues a render, as `stateHasChanged()` does (coalesced, an equal
value does nothing). It needs `accessor` — a field decorator can't intercept assignments; the
check reports it and offers the fix. It is **shallow**: `this.laps.push(x)` doesn't render,
`this.laps = [...this.laps, x]` does.

> **Coming from Blazor:** Blazor has no counterpart — `@State` is a Tsazor extension, and
> `StateHasChanged()` (here `stateHasChanged()`) keeps working everywhere. Don't confuse it with
> .NET 10's `[PersistentState]`, which carries state across prerendering.
