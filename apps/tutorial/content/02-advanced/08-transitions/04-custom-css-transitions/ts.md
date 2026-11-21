---
title: Custom CSS transitions
keywords: custom transitions, Transition, css, elasticOut, t and u
focus: App.tsazor
gate: check input; look
---

The built-ins cover a lot, but a transition is just a function — you can write your own. This
text deserves a big entrance: let it spin in.

A transition gets the element and returns its **config**: how long it takes and how the element
looks along the way. `spin` already has the duration. Add `css`, a function from `t` to style:

```ts
spin(duration: number): Transition {
    return () => ({
        duration,
        css: (t) => {
            const eased = elasticOut(t);
            return `
                transform: scale(${eased}) rotate(${eased * 1080}deg);
                color: hsl(${Math.trunc(t * 360)}, ${Math.min(100, 1000 * (1 - t))}%, ${Math.min(50, 500 * (1 - t))}%);
            `;
        },
    });
}
```

Then use it as the intro, and keep a plain fade for the exit:

```tsazor
<div class="centered" @in="spin(8000)" @out="fade">
```

Untick and tick the box. `t` goes from 0 to 1 during an intro and from 1 to 0 during an outro;
a second parameter `u` is always `1 - t`. Here `elasticOut` bends `t`, so the text overshoots
and springs back. (A config can also take an `easing` and get `t` already bent.)

Tsazor asks `css` for the style at many points up front and hands the result to the browser's
animation engine, which plays it smoothly even while your code is busy. That's why `css` is the
first choice. `spin(8000)` returns a `Transition` — the type from `@tsazor/runtime` — just as
`fly({ … })` did.
