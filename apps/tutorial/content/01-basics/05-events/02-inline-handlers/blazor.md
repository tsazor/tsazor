---
title: Inline handlers
focus: App.tsazor
gate: click .colors button:nth-child(3)
---

Lambdas as handlers, the way you write them in Razor:

```tsazor
<button style="background: @color" aria-label="@color" @onclick="() => picked = color"></button>
```

Click the swatches. `picked` is the component's field — the compiler adds the `this.` —
and `color` is the loop variable. Method calls with arguments work as usual:
`@onclick="() => pick(color)"`, and `(event) => …` receives the native DOM event.

> **Coming from Blazor:** the classic `@for` capture bug is gone. In C#, a lambda inside
> `for (int i = 0; …)` captures the one loop variable, so every button sees the final `i`
> and you copy it to a local first. In TypeScript, `let` in a `for` header creates a fresh
> binding per iteration, so this just works:
>
> ```tsazor
> @for (let i = 0; i < colors.length; i++) {
>     <button @onclick="() => pick(colors[i])">…</button>
> }
> ```
>
> (With `var` you'd get the C# behavior back — hence warning TZS022.) Lambdas returning a
> value, like `() => count++`, are fine: the result is ignored, as with an `Action`.
