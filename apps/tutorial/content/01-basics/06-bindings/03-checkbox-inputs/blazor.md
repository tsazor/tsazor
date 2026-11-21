---
title: Checkbox inputs
keywords: @bind, checkbox, checked, boolean
focus: App.tsazor
gate: check input
---

On a checkbox, `@bind` binds `checked` — as in Blazor:

```tsazor
<input type="checkbox" @bind="yes" />
```

Tick the box: the message changes and the button is enabled. The field is a plain `boolean`,
the handler writes `event.target.checked`, and the component re-renders.

Nothing differs from Blazor here — except that `disabled="@(!yes)"` is TypeScript's `!`,
and that `false` removes the `disabled` attribute exactly like Razor's boolean attribute
handling.
