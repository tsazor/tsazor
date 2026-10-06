---
title: The transition directive
keywords: @transition, transitions, fade, @tsazor/runtime/transition, prefers-reduced-motion, configureTransitions
focus: App.tsazor
gate: check input; look
---

Untick the box: the paragraph is gone at once, and ticking it brings it back just as abruptly.
Let it fade instead.

A **transition** animates an element as it enters or leaves the page. Import `fade` and put it
on the paragraph:

```tsazor
@import { fade } from "@tsazor/runtime/transition"
```

```tsazor
<p @transition="fade">Fades in and out</p>
```

Toggle the box again. The paragraph fades in, and when it leaves, Tsazor keeps it on the page
until the fade-out is over — only then is it removed.

`@tsazor/runtime/transition` has more: `blur`, `fly`, `slide`, `scale`, and `draw` for SVG
lines. Try a few.

> **Tsazor respects reduced motion.** Some users ask their system for less motion
> (`prefers-reduced-motion`), because animation makes them dizzy. Tsazor plays every transition
> with duration 0 for them — the end state at once — so you don't have to remember it. Motion
> that carries meaning can opt out: `configureTransitions({ reducedMotion: "ignore" })`.

> **Plain CSS works too.** A CSS animation on the element can fade it in. Fading out is the
> hard part: the element must stay until the animation is over, and the page around it has to
> keep working meanwhile. That's what `@transition` does for you.
