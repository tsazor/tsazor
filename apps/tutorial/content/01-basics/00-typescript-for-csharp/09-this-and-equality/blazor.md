---
title: This and equality
focus: basket.ts
typeErrors: true
---

Most of what you know carries over. A few things don't; this lesson and the next cover them
on purpose.

**1. `this` in callbacks.** The basket throws a `TypeError`. JavaScript decides `this` by
*how a function is called*, and `forEach` calls a `function () { … }` as a plain function,
so `this` is `undefined` (the problems panel agrees: TS2683, "'this' implicitly has type
'any'"). An **arrow function** keeps the `this` of where it's written, like a C# lambda:

```ts
prices.forEach((price) => {
    this.total += price;
});
```

Write callbacks as arrow functions, always. The same trap hides in
`setTimeout(this.tick, 1000)`: a method passed by name loses its `this`, so pass
`() => this.tick()`. (`@onclick="save"` in markup is fine; the compiler binds it.)

**2. `==` vs `===`.** `==` converts before it compares: `"0" == 0` and `"" == 0` are both
`true`. Use `===` and `!==`, which compare like C#'s `==` does for primitives. The one
accepted `==` is `x == null`, true for both `null` and `undefined`.

> **Coming from C#:** with known types, the checker catches `"0" == 0` (TS2367, "no
> overlap"); it bites with data typed `any`, like unvalidated JSON.

Solve the basket, though, and it prints `0.30000000000000004` — that's the next lesson.