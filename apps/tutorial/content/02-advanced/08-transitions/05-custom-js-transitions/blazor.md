---
title: Custom JS transitions
keywords: tick, typewriter, JavaScript transitions
focus: App.tsazor
gate: check input; look
---

When CSS isn't enough, a transition returns `tick` — called every animation frame with the
current `t`. A typewriter:

```ts
tick: (t) => {
    element.textContent = text.slice(0, Math.trunc(text.length * t));
},
```

```tsazor
<p @in="typewriter()">The quick brown fox jumps over the lazy dog</p>
```

`tick` runs on the main thread; prefer `css` where it can do the job.

> **Coming from Blazor:** this is the loop you'd write in JS interop with
> `requestAnimationFrame`. Here it's a few lines of TypeScript next to the markup.
