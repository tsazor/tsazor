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

A plain text input would work too: there, `@bind` reads the text the way the field's value
is, so a field that holds a number gets a number. Tsazor goes by the value, not by the
field's declared type, because TypeScript's types are gone when the page runs — the value
is still there. So give a number field a number to start with (`a = 0`): a field that starts
as `null` has nothing to go by and gets the text as it is.
