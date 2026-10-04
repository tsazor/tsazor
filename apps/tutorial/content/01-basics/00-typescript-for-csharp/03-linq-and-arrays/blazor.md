---
title: LINQ and array methods
keywords: LINQ, array methods, map, filter, reduce
focus: report.ts
---

LINQ to Objects has a close cousin: the array methods. Lambdas are written the same way,
`o => o.open` (TypeScript style puts parentheses around the parameter), and they chain the
way you're used to.

| LINQ | Array |
| --- | --- |
| `Where(o => …)` | `filter((o) => …)` |
| `Select(o => …)` | `map((o) => …)` |
| `SelectMany(o => o.Lines)` | `flatMap((o) => o.lines)` |
| `Aggregate(0, (s, o) => …)`, `Sum` | `reduce((s, o) => …, 0)` |
| `FirstOrDefault(o => …)` | `find((o) => …)` (`undefined` if none) |
| `Any(…)` / `All(…)` | `some(…)` / `every(…)` |
| `OrderBy(o => o.Total)` | `toSorted((a, b) => a.total - b.total)` |
| `Take(3)` / `Skip(3)` | `slice(0, 3)` / `slice(3)` |
| `Contains(x)` / `Count()` | `includes(x)` / `length` |

`report.ts` already uses `filter`, `reduce`, `some` and `find`. Fill in `topOpenCustomers`:

```ts
export function topOpenCustomers(): string[] {
    return orders
        .filter((o) => o.open)
        .toSorted((a, b) => b.total - a.total)
        .slice(0, 3)
        .map((o) => o.customer);
}
```

Sorting takes a comparer instead of a key selector: negative means `a` first, so
`b.total - a.total` is `OrderByDescending`. (`toSorted` is ES2023; the recommended tsconfig
includes the ES2023 lib, and so does the tutorial.)

> **Coming from C#:** there's no deferred execution. Each method runs immediately and returns
> a new array: no `IEnumerable` that re-runs when enumerated twice, no `ToList()` needed. And
> watch out for `sort()`: it sorts **in place**, and without a comparer it compares as
> strings (`[10, 9, 1].sort()` gives `[1, 10, 9]`). `toSorted()` returns a sorted copy;
> always pass a comparer. Give `reduce` its seed, too: on an empty array without one, it
> throws.
