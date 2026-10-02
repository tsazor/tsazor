---
title: Component bindings
focus: App.tsazor
gate: click .stepper button[aria-label=More]
---

`Stepper.tsazor` follows Blazor's binding convention: a `value` parameter plus a
`valueChanged` `EventCallback<number>`. `App` passes the value but doesn't listen. Bind it:

```tsazor
<Stepper @bind-value="guests" />
```

Click **+**. As in Razor, `@bind-value` expands to `value="@guests"` plus a
`valueChanged` callback that assigns `guests` — after which `App` re-renders and the new
value flows down again. `@bind-value:after`, `:get`/`:set` and `:event` (a different change
callback) work on components too.

> **Coming from Blazor:** the convention is the same, only the names follow TypeScript's
> camelCase: `[Parameter] public int Value` + `EventCallback<int> ValueChanged` become
> `@Parameter() value = 0` + `@Parameter() valueChanged?: EventCallback<number>`. Names are
> matched case-insensitively, so `@bind-Value` works as well. `ValueExpression` is passed
> only if the component declares that parameter — the forms chapter needs it.
