---
title: Fields that render
keywords: @State, State, accessor, automatic rendering, shallow state
focus: App.tsazor
refactor: true
gate: click button; wait 1100
---

The timer works — but only because of the `stateHasChanged()` in the callback. Forget it in
the next callback you write, and the screen silently stops updating. Let the field take care
of it instead. Mark it with `@State()`:

```ts
@State() accessor seconds = 0;
```

and drop the call:

```ts
setInterval(() => this.seconds++, 1000);
```

The timer ticks as before. Assigning a `@State` field schedules a render of its component,
exactly as `stateHasChanged()` would: several assignments in a row still render once, and
assigning the value it already has does nothing.

`accessor` is part of it. A decorator on a plain field can't see later assignments; on an
`accessor` it can. Leave it out and the check tells you, with a fix that inserts it.

**Only assignments count.** `@State` watches the field, not what's inside it:

```ts
@State() accessor laps: number[] = [];

lap() {
    this.laps.push(this.seconds);         // same array: no render
    this.laps = [...this.laps, this.seconds]; // new array: renders
}
```

> **Tsazor keeps `@State` shallow on purpose.** Watching inside objects would mean wrapping
> them in proxies: they'd no longer be the objects you created, `#private` fields would break,
> and every access would cost a little. Some frameworks do that; Tsazor would rather you see
> exactly which line renders. `stateHasChanged()` keeps working, and inside event handlers you
> need neither.
