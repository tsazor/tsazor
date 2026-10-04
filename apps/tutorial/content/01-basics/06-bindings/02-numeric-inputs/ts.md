---
title: Numeric inputs
keywords: @bind, number input, range, binding
focus: App.tsazor
gate: change input[type=range] 5
---

An input's value is always a string in the DOM — even the value of `<input type="number">`.
Bind the four inputs:

```tsazor
<input type="number" @bind="a" min="0" max="10" />
<input type="range" @bind="a" min="0" max="10" />
```

(and the same for `b`). Drag a slider: the number box follows, and the sum is right —
`5 + 2 = 7`, not `52`. On `type="number"` and `type="range"` inputs, `@bind` converts the
value with `Number()` before assigning it, and keeps the old value when the text isn't a
number at all.

The conversion is chosen by the input's `type`, because that's what the compiler can see.
Bind a number field to a plain text input and `@bind` would assign a string — a type error
that `tsazor check` reports (`Type 'string' is not assignable to type 'number'`). The
check has your back here: the field says `number`, and every assignment has to agree.
