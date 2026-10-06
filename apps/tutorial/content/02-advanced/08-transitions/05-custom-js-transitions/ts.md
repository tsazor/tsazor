---
title: Custom JS transitions
keywords: tick, typewriter, JavaScript transitions
focus: App.tsazor
gate: check input; look
---

Not everything can be said in CSS. A typewriter effect changes the text itself, letter by
letter. For that, a transition has `tick` instead of `css`: a function Tsazor calls on every
animation frame, with the current `t`.

Tick the box: the sentence just appears. `typewriter` measures the text and computes a duration
from it — give it a `tick` that shows the first part of the text:

```ts
tick: (t) => {
    element.textContent = text.slice(0, Math.trunc(text.length * t));
},
```

and use it as the intro:

```tsazor
<p @in="typewriter()">The quick brown fox jumps over the lazy dog</p>
```

Untick and tick the box again, and watch it type. Prefer `css` where you can: `tick` runs on
the main thread, every frame, and stutters when the page is busy. Here there is no other way.
