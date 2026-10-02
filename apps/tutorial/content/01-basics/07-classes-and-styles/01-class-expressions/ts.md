---
title: Class expressions
focus: App.tsazor
gate: click button
---

The card should flip when you click it. The click handler toggles `flipped`, and the
stylesheet already knows what a flipped card looks like (`.flipped .front`, `.flipped .back`)
— but nothing adds the class.

`class` is an attribute like any other, so an expression can produce it. Mix the fixed class
with a conditional one:

```tsazor
<button class="card @(flipped ? "flipped" : null)" @onclick="flip">
```

Click the card. When text and expressions are mixed in an attribute value, `null` and
`undefined` turn into nothing — so the attribute is `card` or `card flipped`.

For more than one or two conditional classes, a small getter keeps the markup readable:

```ts
get cardClass() {
    return ["card", this.flipped && "flipped", this.disabled && "disabled"]
        .filter(Boolean)
        .join(" ");
}
```

```tsazor
<button class="@cardClass" @onclick="flip">
```

The class list is just a string, built with whatever TypeScript you like — there's no
special class syntax to learn.
