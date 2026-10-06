---
title: Custom CSS transitions
keywords: custom transitions, Transition, css, elasticOut, t and u
focus: App.tsazor
gate: check input; look
---

A transition is a function from the element to a **config** (`Transition` from
`@tsazor/runtime`). Write a spinning one — `css` returns the style for each `t`:

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

```tsazor
<div class="centered" @in="spin(8000)" @out="fade">
```

`t` runs 0 → 1 for an intro, 1 → 0 for an outro (`u` is `1 - t`). Tsazor samples `css` up front
and plays it with the browser's animation engine (Web Animations), off the main thread.

> **Coming from Blazor:** the closest thing is a CSS `@keyframes` rule — but that is fixed text,
> where `css` is computed per element (its size, its place, your parameters).
