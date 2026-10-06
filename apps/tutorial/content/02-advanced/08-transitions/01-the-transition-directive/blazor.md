---
title: The transition directive
keywords: @transition, transitions, fade, @tsazor/runtime/transition, prefers-reduced-motion, configureTransitions
focus: App.tsazor
gate: check input; look
---

Untick the box: the paragraph disappears at once. Import `fade` and give the paragraph a
**transition**:

```tsazor
@import { fade } from "@tsazor/runtime/transition"
```

```tsazor
<p @transition="fade">Fades in and out</p>
```

It now fades in, and on the way out Tsazor keeps it in the DOM until the fade has finished.
Other built-ins: `blur`, `fly`, `slide`, `scale`, `draw` (SVG). For users with
`prefers-reduced-motion`, transitions run with duration 0; `configureTransitions({
reducedMotion: "ignore" })` opts out.

> **Coming from Blazor:** Blazor has no counterpart. There you toggle a CSS class, wait for the
> animation (`transitionend` via JS interop, or a `Task.Delay`) and only then remove the element
> from the render tree — while keeping the rest of the component consistent meanwhile.
> `@transition` is a Tsazor extension; Razor tooling doesn't know it.
