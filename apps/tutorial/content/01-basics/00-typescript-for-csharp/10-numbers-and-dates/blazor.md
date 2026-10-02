---
title: Numbers and dates
focus: basket.ts
---

**1. `number` is a double.** The basket runs now, but it says `0.30000000000000004`. There's
no `int` and no `decimal`: `7 / 2` is `3.5`, and cents don't add up exactly. Count money in
integer **cents** (integers are exact up to `Number.MAX_SAFE_INTEGER`):

```ts
this.total += Math.round(price * 100);
```

and show `(basket.total / 100).toFixed(2)`. For real money logic, keep `decimal` in your
.NET backend and let the frontend display the results; `bigint` and decimal libraries are
the other options. Format with `Intl.NumberFormat`.

**2. `Date`.** Months count from **0**: `new Date(2026, 9, 2)` is October 2nd. A `Date` is
mutable (`setDate` changes it in place), and `new Date("2026-10-02")` is midnight UTC, which
is still October 1st in New York. Keep API dates as ISO strings, convert at the edges, and use
a library (`date-fns`, Luxon) for date math.

> **Coming from C#:** this chapter and the .NET types you'll reach for (`List`,
> `Dictionary`, `DateTime`, `IDisposable`, …) are in the
> [C# to TypeScript cheat sheet](https://github.com/HolgerTheHuck/Tsazor/blob/main/docs/csharp-to-typescript.md).
> Next up: Tsazor itself.