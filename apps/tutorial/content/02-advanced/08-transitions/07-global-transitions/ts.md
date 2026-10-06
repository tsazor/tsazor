---
title: Global transitions
keywords: :global, @transition:global, local transitions, global transitions, slide
focus: Item.tsazor
gate: input .count 3; look
---

Each item in this list has `@transition="slide"`. Drag the slider, though: items pop in and
out, nothing slides. Untick "show list": the whole list vanishes at once.

Transitions are **local** to their component. A transition plays when its own component's
render adds or removes the element — not when the component itself appears or disappears.
That keeps a page calm: opening a page full of components doesn't set off every transition in
it. Here, though, the slider adds and removes whole `Item` components, and their `div` arrives
with them.

Make the transition **global** with the `:global` modifier, written next to it:

```tsazor
<div class="item" @transition="slide" @transition:global>@Text</div>
```

Now the items slide when the slider adds or removes them, and when the whole list comes and
goes. `@in:global` and `@out:global` work the same way. One exception stays: when the app first
starts, nothing plays its intro.

> **Tsazor draws the line at the component.** In other frameworks a transition is local to the
> nearest `@if` or loop around it. Tsazor's control flow leaves no trace in the rendered
> output, so the component is the boundary: inside one component, an outer `@if` plays the
> transitions of everything it removes.
