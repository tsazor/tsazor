---
title: Async work
focus: App.tsazor
gate: click button; wait 50; look
---

Real apps wait for things: a server, a file, a timer. In Tsazor, an event handler can simply
be an `async` method. Click the button — after a moment, the result appears.

But during that moment nothing happens, and you can click the button as often as you like.
Let's show that something is going on. Set the state *before* the `await`:

```ts
async roll() {
    this.rolling = true;
    this.message = "Rolling…";
    const value = await rollDie();
    this.message = `You rolled a ${value}.`;
    this.rolling = false;
}
```

Now "Rolling…" shows up immediately and the button is disabled while you wait. When a handler
returns a promise, Tsazor renders twice: once when the handler reaches its first `await` —
with whatever state the synchronous part set up — and once more when the promise settles.

So the rule from the last lessons still holds, it just has two halves: everything you change
before the first `await` is on screen right away, everything after it once the work is done.
No `stateHasChanged()` needed — the handler is still the handler, even across `await`s.

`rollDie` lives in `dice.ts`, a plain TypeScript module next to the component, imported with
`@import` like any other module.
