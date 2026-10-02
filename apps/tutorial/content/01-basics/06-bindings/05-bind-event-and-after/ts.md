---
title: Binding while typing
focus: App.tsazor
gate: input input ap; wait 300
---

A search box should search as you type, not when you press Enter. Two modifiers on `@bind`
get us there. First, choose the event that writes the value back:

```tsazor
<input @bind="query" @bind:event="oninput" />
```

Now `query` updates on every keystroke (the `input` event) instead of on `change`. But
nothing searches yet. We need to run `search` each time the binding has written a new value
— that's `@bind:after`:

```tsazor
<input @bind="query" @bind:event="oninput" @bind:after="search" placeholder="Search for fruit" />
```

Type "ap". After every keystroke, `@bind` assigns `query` *first* and then calls `search`,
so the method always sees the current text. Since `search` is async, the binding awaits it,
and the component renders around the `await` like after any async handler: "Searching…"
right away, the results when they're there.

Why not an `@oninput` handler that does both? You could — but then you'd write the
assignment yourself, and the input would no longer be bound. `@bind:after` keeps the
binding declarative and adds the side effect: saving a draft, validating, fetching
suggestions.
