---
title: Global transitions
keywords: :global, @transition:global, local transitions, global transitions, slide
focus: Item.tsazor
gate: input .count 3; look
---

Drag the slider: the items don't slide, although `Item.tsazor` has `@transition="slide"`.
Transitions are **local** to their component — they play when the component's own render adds
or removes the element, not when the component itself is added or removed, as the parent's
`@foreach` does here. The valueless `:global` modifier changes that:

```tsazor
<div class="item" @transition="slide" @transition:global>@Text</div>
```

The same for `@in:global` and `@out:global`. No intro plays in the app's first render.

> **Coming from Blazor:** `:global` follows Razor's directive-attribute syntax, like
> `@onclick:preventDefault`. Why the component is the boundary: `@if` and `@foreach` emit flat
> frames, as in Blazor, so within one component the runtime can't tell which block removed an
> element.
