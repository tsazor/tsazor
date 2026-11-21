---
title: Field styles
keywords: validation styles, invalid, modified, ::deep
focus: Bread.tsazor.css
gate: click nav a:nth-child(3); click button
---

The inputs already carry Blazor's classes: `valid`, `invalid`, `modified valid` and
`modified invalid`. All that's missing is CSS. Since the inputs are rendered by
`InputText` and friends, not by this page, you need `::deep`, as with CSS isolation in
Blazor:

```css
label ::deep input.invalid,
label ::deep select.invalid {
    border-color: #b3261e;
}
```

Add the same for `modified valid` in green (`#1a7f37`), and color the messages
(`::deep .validation-message`) and the summary (`.summary ::deep .validation-errors`).
Press Reserve with an empty name: red. Type a name: green.

> **Coming from Blazor:** nothing new here. The classes come from the `EditContext` as in
> Blazor's `FieldCssClass`, and `::deep` works exactly like Blazor's.
