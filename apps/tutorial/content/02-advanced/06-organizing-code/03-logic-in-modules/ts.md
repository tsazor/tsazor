---
title: Logic in modules
keywords: modules, @import, plain functions
focus: Receipt.tsazor
---

`Receipt.tsazor` works, but its top is a little program: a loop, two business rules, a sum —
all inside `@{ }`. That's a smell. The rules can't be tested without rendering a receipt, and
`App` can't show the total in its heading without copying them.

Pricing rules don't need a component. Move them into `pricing.ts` as a plain function:

```ts
export interface Totals {
    subtotal: number;
    discount: number;
    shipping: number;
    total: number;
}

/** 10% off from €40, free shipping from €30 after the discount. */
export function totals(lines: readonly Line[]): Totals {
    const subtotal = lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const discount = subtotal >= 40 ? Math.round(subtotal * 10) / 100 : 0;
    const shipping = subtotal - discount >= 30 ? 0 : 4.9;
    return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}
```

In `Receipt.tsazor`, import it next to `formatMoney`, delete the `@{ }` block, and read the
numbers through a getter:

```ts
get sum() {
    return totals(this.lines);
}
```

(`@formatMoney(sum.subtotal)` and so on in the markup.) Now the payoff: `App` can use the same
function for its heading — `<h1>Your basket · @formatMoney(totals(lines).total)</h1>`, with
`totals` and `formatMoney` imported.

A few rules of thumb for where code goes:

- **Markup** describes structure. `@{ const label = … }` to name something is fine; loops that
  compute are not.
- **Getters** derive values from the component's own state (`get sum()` here).
- **Plain modules** hold logic that doesn't need a component — calculations, formatting,
  validation. They're testable with any test runner, in microseconds.
- **Services** hold logic with state that several components share (the cart from the services
  chapter).
- **Code-behind** is for when the component's *own* code gets large — it moves code, it doesn't
  make it reusable.
