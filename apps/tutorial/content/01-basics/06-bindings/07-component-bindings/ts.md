---
title: Component bindings
focus: App.tsazor
gate: click .stepper button[aria-label=More]
---

`@bind` isn't limited to inputs. Look at `Stepper.tsazor`: it shows a `value` parameter and,
when a button is clicked, doesn't change `value` itself — it reports the new number through
`valueChanged`. The parent owns the state; the stepper only proposes changes.

Right now `App` passes the value down but doesn't listen, so the buttons do nothing. Bind
it instead:

```tsazor
<Stepper @bind-value="guests" />
```

Click **+**. `@bind-value` is shorthand for a parameter *and* its change event:

```tsazor
<Stepper value="@guests" valueChanged="(value) => guests = value" />
```

The convention is the whole contract: a parameter `x` plus an `EventCallback` named
`xChanged` make `@bind-x` work on any component. Since `valueChanged` is an
`EventCallback<number>`, `App` re-renders after the assignment, and the new value flows back
down into the stepper.

This is the pattern for every reusable input — a date picker, a rating, a color chooser:
the component stays stateless about the value, and whoever uses it decides where it lives.
`@bind-value:after` works here as well, like on elements.
