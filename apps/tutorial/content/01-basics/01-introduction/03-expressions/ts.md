---
title: Expressions in markup
keywords: expressions, @, interpolation
focus: App.tsazor
---

After an `@`, you're writing TypeScript. There are two forms.

An **implicit expression** is `@` followed by a name, with any member accesses and calls
attached. Make the greeting shout:

```tsazor
<h1>Hello @name.toUpperCase()!</h1>
```

An implicit expression ends at the first space — that's why the total in the preview reads
"3 * price €": only `@quantity` was code, the rest is text. Whenever an expression contains
spaces or operators, wrap it in parentheses to make it an **explicit expression**:

```tsazor
<p>Total: @(quantity * price) €</p>
```

Anything goes inside `@( … )` as long as it's a single TypeScript expression: arithmetic,
ternaries (`@(quantity > 1 ? "tickets" : "ticket")`), function calls, template literals.

Values are rendered as text: numbers and booleans with JavaScript's usual string conversion,
`null` and `undefined` as nothing. Text is always escaped, so a string containing `<b>` shows
up as the characters `<b>` — we'll see how to render real HTML at the end of this chapter.
