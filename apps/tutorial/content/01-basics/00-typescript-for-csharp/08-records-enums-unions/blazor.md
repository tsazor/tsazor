---
title: Records, enums and unions
focus: orders.ts
---

Grace's order shows "❓ Unknown". The bug is a typo, `"shiped"`, and with `status: string` the
compiler has no way to catch it. In C# you'd reach for an `enum`. In TypeScript, the
idiomatic tool is a **union of string literals**:

```ts
export type OrderStatus = "open" | "shipped" | "delivered";
```

Use it for `Order.status` and for `label`'s parameter. Now the typo is an error (TS2678,
`"shiped"` is not comparable to `OrderStatus`); fix it, and the order is on its way. Then
delete the `default` branch: the compiler knows the `switch` covers every case, so it no
longer asks for a fallback `return`. Add a fourth status later and `label` stops compiling
until you handle it, which is exhaustiveness checking, built in.

A union is better than an enum here because the values *are* the data: `"shipped"` is what
the JSON from your API contains, what you see in the debugger, and what you write in a test.

| C# | TypeScript |
| --- | --- |
| `enum OrderStatus { Open, Shipped }` | `type OrderStatus = "open" \| "shipped"` |
| `Enum.GetValues<OrderStatus>()` | `const STATUSES = ["open", "shipped"] as const;` then `type OrderStatus = (typeof STATUSES)[number];` |
| `record Order(int Id, …)` | `interface Order { readonly id: number; … }` + an object literal |
| `order with { Status = … }` | `{ ...order, status: "shipped" }` |
| `struct` | no value types: objects are always references |
| `Result<T>` / class hierarchy | a discriminated union: `{ ok: true; value: T } \| { ok: false; error: string }` |

> **Coming from C#:** a record has **value equality**; a TypeScript object doesn't.
> `{ id: 1 } === { id: 1 }` is `false`, because objects compare by reference, so compare the
> fields (or the ids) yourself. TypeScript does have an `enum`, but it's one of the few
> TypeScript features that generates JavaScript code, and most codebases (Tsazor's included)
> use unions instead. `as const` turns a literal into its narrowest read-only type, which is
> how you get both a runtime list of the values (for a `<select>`) and the union type from one
> declaration.
