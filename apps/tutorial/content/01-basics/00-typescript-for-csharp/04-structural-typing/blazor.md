---
title: Classes, interfaces, generics
keywords: structural typing, interface, class, generics, implements
focus: greetings.ts
---

Classes, interfaces and generics read almost like C#: `class Customer implements Named`,
`constructor(…)` instead of a method named after the class, and generic constraints
written `T extends Named` instead of `where T : INamed`. (The constructor's
`readonly name: string` parameters declare and assign the properties in one go, much like a
primary constructor.)

The real difference is one concept, and it's worth a minute: **TypeScript's types are
structural, not nominal.** In C#, a `Product` is an `INamed` only if its declaration says so.
In TypeScript, anything with a `name: string` *is* a `Named`, because the compiler compares
shapes, not declarations. `implements` is optional; it only asks the compiler to check the
class against the interface early.

`Product` has a `name` but never mentions `Named`. Greet it anyway, and greet a plain object
literal while you're at it:

```ts
export const greetings: string[] = [
    greet(customer),
    greet(product),
    greet({ name: "Grace" }),
];
```

No adapter, no `implements`, and it type-checks. `longest` works with both, too.

What follows from this:

- **Interfaces don't exist at runtime.** Types are erased when TypeScript compiles to
  JavaScript, so `x instanceof Named` is an error (TS2693, "only refers to a type"). There's no
  `typeof(T)` and no `new T()` in a generic either. To test for a shape at runtime, write a
  type guard: `function isNamed(x: unknown): x is Named`. `instanceof` still works for classes.
- **Same shape, same type.** Two aliases `type CustomerId = string` and `type OrderId = string`
  are interchangeable; nothing stops you from passing one for the other. If that matters,
  "brand" them: `type CustomerId = string & { readonly __brand: "CustomerId" }`.
- **Object literals are checked strictly.** `greet({ name: "Grace", age: 36 })` is an error
  (TS2353, an unknown property in a fresh literal), while passing an object variable with
  extra properties is fine.

> **Coming from C#:** think of every interface as "anything with these members". That's
> what makes plain objects from `JSON.parse` or a `fetch` usable as typed data without
> mapping them into classes: an `interface Order` describes the JSON, and you don't need a
> DTO class at all.
