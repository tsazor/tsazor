---
title: Loops
keywords: @foreach, loops, for…of, lists
focus: App.tsazor
---

The list shows only its first item. Loop over the array:

```tsazor
<ul>
    @foreach (const item of items) {
        <li>@item</li>
    }
</ul>
```

`@foreach` keeps its name, but the header is TypeScript's `for…of`: `const item of items`.
Write it the C# way — `@foreach (var item in items)` — and the compiler stops with TZS021,
naming the TS form (the VS Code extension and `tsazor codemod` apply that fix for you).
Destructuring replaces deconstruction:

```tsazor
@foreach (const [index, item] of items.entries()) {
    <li>@(index + 1). @item</li>
}
```

> **Coming from Blazor:** watch `in` vs. `of`. In TypeScript, `for (const k in obj)` is
> valid — and iterates the object's *keys*, so `@foreach (const x in items)` would list
> `0, 1, 2…`. `@for`, `@while` and `@do` are plain TS loops. Prefer `const`/`let`: they
> create a fresh variable per iteration. `var` is accepted with warning TZS022 — it's a
> single function-scoped variable, so lambdas created in the loop would all see its final
> value.
