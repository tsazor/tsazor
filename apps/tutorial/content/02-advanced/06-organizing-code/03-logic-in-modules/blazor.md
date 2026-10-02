---
title: Logic in modules
focus: Receipt.tsazor
---

`@{ }` blocks with real logic are as much a smell in `.tsazor` as in `.razor`. `Receipt.tsazor`
computes its totals inline; `App` would like the total in its heading. Move the rules into a
function in `pricing.ts`:

```ts
export function totals(lines: readonly Line[]): Totals {
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const discount = subtotal >= 40 ? Math.round(subtotal * 10) / 100 : 0;
    const shipping = subtotal - discount >= 30 ? 0 : 4.9;
    return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}
```

(with an exported `Totals` interface), then in `Receipt.tsazor` replace the `@{ }` block with a
getter, `get sum() { return totals(this.lines); }`, and use it in `App`'s heading:
`@formatMoney(totals(lines).total)`.

> **Coming from Blazor:** where you'd write a `static class PricingRules` (or a service with no
> state) in C#, TypeScript has the module: exported functions, imported with
> `@import { totals } from "./pricing"`, and called as free names in markup — no `this.`, no
> class. Keep services for logic with shared state; keep getters for values derived from the
> component's own fields.
