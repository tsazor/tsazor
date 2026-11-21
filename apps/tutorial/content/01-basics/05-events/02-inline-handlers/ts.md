---
title: Inline handlers
keywords: inline handlers, lambda, arrow functions, event handlers
focus: App.tsazor
gate: click .colors button:nth-child(3)
---

A method name is the simplest handler. When the handler needs an argument — *which* color
was clicked — write an arrow function instead:

```tsazor
<button style="background: @color" aria-label="@color" @onclick="() => picked = color"></button>
```

Click the swatches. The arrow function is TypeScript like every other expression in the
markup, so `picked` is the component's field (the compiler turns it into `this.picked`) and
`color` is the loop variable. You can call methods with arguments, too:
`@onclick="() => pick(color)"`.

Each click picks the right color because the loop variable is a `const`: every iteration
has its own `color`, and every arrow function captures its own. The same is true for a
counting loop with `let`:

```tsazor
@for (let i = 0; i < colors.length; i++) {
    <button @onclick="() => pick(colors[i])">…</button>
}
```

To get the event object as well, take it as the arrow function's parameter:
`@onclick="(event) => pick(color, event.shiftKey)"`.

Whatever the handler does, the component renders afterwards. Small handlers are fine
inline; once one grows beyond a single expression, give it a name and make it a method.
