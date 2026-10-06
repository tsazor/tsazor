---
title: Async work
keywords: async, await, Promise, event handlers, Task
focus: App.tsazor
gate: click button; wait 50; look
---

Async handlers work as in Blazor: `async roll()` returns a `Promise` instead of a `Task`, and
`await` means what you expect. Click the button — after a moment, the result appears.

While you wait, nothing indicates progress. Set the state before the `await`:

```ts
async roll() {
    this.rolling = true;
    this.message = "Rolling…";
    const value = await rollDie();
    this.message = `You rolled a ${value}.`;
    this.rolling = false;
}
```

This is Blazor's `HandleEventAsync` behavior: the component renders after the synchronous
part of the handler (up to the first `await`) and again when the returned promise completes.
"Rolling…" appears immediately, the result when the die has landed.

> **Coming from Blazor:** `Task` becomes `Promise<void>` (here inferred from `async`),
> `await Task.Delay(800)` becomes `await new Promise((resolve) => setTimeout(resolve, 800))`,
> and there's no `async void` trap — a handler is just a method that may return a promise.
> `rollDie` comes from a TypeScript module next to the component, imported with `@import`.
