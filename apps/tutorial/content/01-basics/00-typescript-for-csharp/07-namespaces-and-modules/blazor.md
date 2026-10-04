---
title: Namespaces and modules
keywords: modules, namespaces, import, export, @import
focus: invoice.ts
---

TypeScript has no namespaces you'd use and no assemblies. **Every file is a module.** What
a file exports is its public surface; everything else is private to the file (your
`internal`), and another file sees only what it imports, by path:

| C# | TypeScript |
| --- | --- |
| `namespace Shop.Billing;` | the file *is* the unit, no declaration |
| `public static string FormatMoney(…)` | `export function formatMoney(…)` |
| `internal` / `private static` | not exported |
| `using Shop.Billing;` | `import { formatMoney } from "./money";` |
| `using static Shop.Billing.Money;` | the same `import`: functions don't need a class |
| `global using …` / `_Imports.razor` | `_Imports.tsazor` (for `.tsazor` files only) |
| a NuGet package | an npm package: `import { … } from "@tsazor/runtime";` |

The invoice prints bare numbers (`42.5`, `8.5`, `51`) instead of amounts. `money.ts` has the formatter, but it isn't
exported, so `invoice.ts` can't import it (try it: TS2459, "declares 'formatMoney' locally,
but it is not exported"). Export it in `money.ts`:

```ts
export function formatMoney(amount: number): string {
```

then import it next to `VAT_RATE` in `invoice.ts` and use it for all three amounts:

```ts
import { VAT_RATE, formatMoney } from "./money";
```

In a `.tsazor` file the same import is the `@import` directive; you'll see it at the top of
`App.tsazor`.

> **Coming from C#:** a module's top-level code runs **once**, the first time anything
> imports it, so module-level `const`s are your `static readonly` fields, and a module of
> exported functions is your `static class`. No class needed. Prefer named exports
> (`export function`) over `export default`: they keep one name across the codebase and the
> editor can add the import for you. `import type { Order } from "./orders"` imports a
> type only, which disappears from the compiled JavaScript entirely.
