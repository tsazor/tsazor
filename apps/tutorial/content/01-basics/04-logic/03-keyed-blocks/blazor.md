---
title: Keyed loops
focus: App.tsazor
gate: click button
---

Click **Remove first thing** a few times: the names are right, the emojis are not. It's the
behavior you know from Blazor's diff: without keys, the renderer matches by sequence
position, so the first `Thing` instance is kept and simply receives `name="banana"`, while
the *last* instance is disposed. `Thing` picks its emoji in `onInitialized`, so the stale
apple stays.

The fix is the same as in Blazor:

```tsazor
<Thing name="@thing.name" @key="thing.id" />
```

The preview restarts after the edit; click the button again — every `Thing` now stays with
its item.

> **Coming from Blazor:** the diff is a port of Blazor's `RenderTreeDiffBuilder`, so `@key`
> behaves identically: matching by key within the sibling set, a key miss means
> dispose + create, and duplicate keys are an error. Keys are compared like JavaScript
> values (`===`), so use an id — two object literals with the same content are different
> keys.
