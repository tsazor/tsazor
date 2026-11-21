---
title: Field styles
keywords: validation styles, invalid, modified, ::deep
focus: Bread.tsazor.css
gate: click nav a:nth-child(3); click button
---

An invalid field should stand out: a red border, and a green one once it's fixed. You don't
have to track that yourself. Press Reserve with an empty name and inspect the name input:

```html
<input class="invalid" value="">
```

Every input component carries its state as a class: `valid` or `invalid` while the user
hasn't touched it, `modified valid` or `modified invalid` after a change. All you need is
CSS.

There's a catch. Your stylesheet is scoped to the markup *you* wrote in `Bread.tsazor`, and
the `<input>` isn't yours — `InputText` renders it. So a plain `input.invalid` selector
won't match. To reach into another component's output, use `::deep`:

```css
label ::deep input.invalid,
label ::deep select.invalid {
    border-color: #b3261e;
}
```

The part before `::deep` stays scoped (one of *your* labels), the part after it matches
anything inside. Read it as "an invalid input somewhere inside one of my labels".

Add rules to `Bread.tsazor.css` for:

- `input.modified.valid` and `select.modified.valid` under a label, with a green border
  (`#1a7f37`),
- the messages in red: `::deep .validation-message`,
- the summary in red: `.summary ::deep .validation-errors` (the page wraps it in a
  `<div class="summary">`).

Press Reserve with an empty name: the border and the messages turn red. Type a name, and
the border turns green.
