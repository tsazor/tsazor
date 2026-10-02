---
title: Types and nullability
focus: orders.ts
---

This short chapter is for C# developers new to TypeScript. The good news first: **you
already know most of it.** TypeScript and C# share a designer, Anders Hejlsberg, and it
shows: classes, interfaces, generics, `async`/`await`, lambdas, `?.` and `??` look the way
you expect. Each lesson covers one thing that looks the same but isn't; the
[C# to TypeScript cheat sheet](https://github.com/HolgerTheHuck/Tsazor/blob/main/docs/csharp-to-typescript.md)
has the full tables. Already fluent? Skip ahead to [Welcome](blazor/welcome).

| C# | TypeScript |
| --- | --- |
| `var total = 0;` | `let total = 0;` (inferred: `number`) |
| `const int Max = 5;` | `const max = 5;` |
| `int`, `long`, `double`, `decimal` | `number` (see the last lesson) |
| `string? Note` | `note: string \| null` |
| `int? Quantity` (may be absent) | `quantity?: number`, i.e. `number \| undefined` |

TypeScript has **two** "nothing" values: `undefined` means *not there* (a missing property,
an optional parameter), `null` means what you set it to. Tsazor checks in strict mode, which
is `<Nullable>enable</Nullable>`, enforced: `order.shipping.city` without a check is an
**error** (TS18048, "possibly 'undefined'"), not a warning. A check narrows the type the way
C#'s flow analysis does; that's why `cityOf` in `orders.ts` compiles.

Now look at Grace in the preview: she ordered `0` items, but the table says 1. `||` falls
back on every *falsy* value (`0`, `""`, `false`, `NaN`, `null`, `undefined`), and since C#
has no truthiness, this one bites. Use the operators you know:

```ts
export function quantityOf(order: Order): number {
    return order.quantity ?? 1;
}

export function cityOf(order: Order): string {
    return order.shipping?.city ?? "(pickup)";
}
```

`??` and `?.` mean what they mean in C#, for `null` and `undefined` alike. Shorten `noteOf`
the same way.

> **Coming from C#:** `let` is your `var`; `const` is a variable that can't be reassigned
> (the object it holds can still change). Don't use JavaScript's old `var`. Inference works
> as in C# (`let total = 0` is a `number`; assigning a string later is an error), so you
> annotate parameters and public shapes and let inference do the rest.
