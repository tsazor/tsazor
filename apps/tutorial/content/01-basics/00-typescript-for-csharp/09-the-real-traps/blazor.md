---
title: The real traps
focus: basket.ts
typeErrors: true
---

Most of what you know carries over. These four don't; learn them on purpose.

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

**2. `number` is a double.** Now the basket says `0.30000000000000004`. There's no `int` and
no `decimal`: `7 / 2` is `3.5`, and cents don't add up exactly. Count money in integer
**cents** (integers are exact up to `Number.MAX_SAFE_INTEGER`):

```ts
this.total += Math.round(price * 100);
```

and show `(basket.total / 100).toFixed(2)`. For real money logic, keep `decimal` in your
.NET backend and let the frontend display the results; `bigint` and decimal libraries are
the other options. Format with `Intl.NumberFormat`.

**3. `==` vs `===`.** `==` converts before it compares: `"0" == 0` and `"" == 0` are both
`true`. Use `===` and `!==`, which compare like C#'s `==` does for primitives. The one
accepted `==` is `x == null`, true for both `null` and `undefined`.

**4. `Date`.** Months count from **0**: `new Date(2026, 9, 2)` is October 2nd. A `Date` is
mutable (`setDate` changes it in place), and `new Date("2026-10-02")` is midnight UTC, which
is still October 1st in New York. Keep API dates as ISO strings, convert at the edges, and use
a library (`date-fns`, Luxon) for date math.

> **Coming from C#:** with known types, the checker catches `"0" == 0` (TS2367, "no
> overlap"); it bites with data typed `any`, like unvalidated JSON. This chapter and the .NET
> types you'll reach for (`List`, `Dictionary`, `DateTime`, `IDisposable`, …) are in the
> [C# to TypeScript cheat sheet](https://github.com/HolgerTheHuck/Tsazor/blob/main/docs/csharp-to-typescript.md).
> Next up: Tsazor itself.
