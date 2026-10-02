---
title: When a component renders
focus: App.tsazor
gate: click button; wait 1100
---

How did Tsazor know that `count` changed in the last lesson? It didn't watch the field —
fields are plain properties, nothing is proxied or tracked. It knew because *it called your
event handler*: after a handler runs, the component renders again. That's the whole rule.

It also means a change that happens anywhere else goes unnoticed. Click **Start**: the
button gets disabled (that change happened in the handler), but the seconds never move, even
though `this.seconds++` runs every second. Nothing told the component to render.

That's what `stateHasChanged()` is for. Call it after changing state outside of an event
handler — in a timer, a callback, a message from a web socket:

```ts
setInterval(() => {
    this.seconds++;
    this.stateHasChanged();
}, 1000);
```

Now the counter ticks. `stateHasChanged()` doesn't render on the spot — it schedules a render
for the current batch, so calling it several times in a row still renders once.

Think of it as the explicit version of what Tsazor does after every handler. Most of the
time you'll never write it; when a value changes and the screen doesn't, it's the first
thing to check.
