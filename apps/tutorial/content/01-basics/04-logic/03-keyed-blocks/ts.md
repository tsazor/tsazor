---
title: Keyed loops
keywords: @key, keyed loops, lists
focus: App.tsazor
gate: click button
---

Click **Remove first thing** a couple of times. The names update correctly — but the emojis
don't: the banana suddenly shows an apple. What's going on?

When the list changes, Tsazor compares the new render with the previous one *by position*.
The first `<Thing>` is still there — it just gets `name="banana"` now, as a new parameter
value. The component that disappears is the *last* one. `Thing` picks its emoji only once,
in `onInitialized`, so the first instance keeps its apple.

Usually reusing components by position is exactly right: it's cheap, and state like an
input's text survives a re-render. For lists whose items can move, be inserted or removed,
tell Tsazor which item is which with `@key`:

```tsazor
<Thing name="@thing.name" @key="thing.id" />
```

Now the comparison matches components by their key: removing the first thing removes the
`Thing` with key `1`, and every other instance stays with its item. (The preview starts over
after every edit, so all five things are back — click the button again.)

Any value can be a key — a number, a string, the item object itself — as long as it's
unique within the loop. `@key` works on elements too (`<li @key="item.id">`).
