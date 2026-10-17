---
title: Numeric inputs
keywords: @bind, number input, range, binding
focus: App.tsazor
gate: change input[type=range] 5
---

Bind the four inputs:

```tsazor
<input type="number" @bind="a" min="0" max="10" />
<input type="range" @bind="a" min="0" max="10" />
```

(and the same for `b`). Drag a slider: the number box follows and the sum is `5 + 2 = 7`.

> **Coming from Blazor:** Blazor picks the conversion from the field's C# type
> (`BindConverter`). TypeScript's types are gone at runtime, so Tsazor picks it from the
> value the field holds when the change arrives: a `number` reads the text as a number (an
> unparsable text keeps the previous value, like a failed `TryParse`), a `Date` as a date
> (`yyyy-MM-dd`, Blazor's default for date inputs), a `Decimal` as a `Decimal`, anything
> else stays a string. `type="number"` and `type="range"` always read a number,
> `type="checkbox"` binds `checked`. The one thing to remember: a field that starts as
> `null` has no value to go by and gets the string. Culture is invariant unless you ask
> for `@bind:culture` (Part 3).
