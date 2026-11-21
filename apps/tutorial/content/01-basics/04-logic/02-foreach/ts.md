---
title: Loops
keywords: @foreach, loops, for…of, lists
focus: App.tsazor
---

The shopping list only shows its first item. Rather than copying the `<li>` five times,
loop over the array with `@foreach`:

```tsazor
<ul>
    @foreach (const item of items) {
        <li>@item</li>
    }
</ul>
```

The header is a TypeScript `for…of` header — `@foreach (const item of items)` — and it
iterates anything iterable: arrays, `Map`s, `Set`s, generators. Destructuring works too.
Number the list with `entries()`:

```tsazor
@foreach (const [index, item] of items.entries()) {
    <li>@(index + 1). @item</li>
}
```

`for…in` is supported as well and, as in plain TypeScript, iterates the *keys* of an
object. For counting loops there's `@for (let i = 0; i < items.length; i++)`, plus `@while`
and `@do`.

Use `const` (or `let`) for the loop variable. Each iteration then gets its own variable —
which matters as soon as something keeps a reference to it, like the click handlers in the
next chapter.
