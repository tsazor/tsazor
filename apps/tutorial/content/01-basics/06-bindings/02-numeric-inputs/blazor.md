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
> (`BindConverter`). Tsazor can't see field types at runtime, so it picks it from the
> element: `type="number"` and `type="range"` convert with `Number()` (an unparsable value
> keeps the previous one, like a failed `TryParse`), `type="date"` converts to a `Date`
> (formatted `yyyy-MM-dd`, Blazor's default for date inputs), `type="checkbox"` binds
> `checked`. Everything else assigns the string. If the field is a `number` and the input
> isn't, `tsazor check` reports the assignment — the type error replaces Blazor's
> conversion. Culture is always invariant.
