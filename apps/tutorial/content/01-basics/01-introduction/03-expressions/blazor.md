---
title: Expressions in markup
keywords: expressions, @, interpolation
focus: App.tsazor
---

Razor's two expression forms work exactly as you know them — only the code inside them is
TypeScript.

An **implicit expression** is `@` followed by a name, member accesses and calls. Make the
greeting shout:

```tsazor
<h1>Hello @name.toUpperCase()!</h1>
```

`toUpperCase()` is the JavaScript string method — the TypeScript standard library takes the
place of the .NET base class library, so it's `toUpperCase()`, not `ToUpper()`.

An implicit expression ends at the first space. That's why the total in the preview reads
"3 * price €" — only `@quantity` was code. For anything with operators, use an **explicit
expression**, `@( … )`:

```tsazor
<p>Total: @(quantity * price) €</p>
```

> **Coming from Blazor:** values are rendered with JavaScript's string conversion, not .NET's
> `ToString()`: `4.5` renders as `4.5` regardless of culture, `true` as `true` (not `True`),
> and `null` or `undefined` as nothing. Formatting is up to you — for example
> `@price.toFixed(2)`.
