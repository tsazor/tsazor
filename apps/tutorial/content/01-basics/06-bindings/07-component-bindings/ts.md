---
title: Component bindings
focus: App.tsazor
gate: click .stepper button[aria-label=More]
---

`@bind` isn't limited to inputs. Look at `Stepper.tsazor`: its `value` is declared with
`@Bindable()` instead of `@Parameter()` — a parameter that works in both directions. The
buttons simply assign `this.value`.

Click **+**: the stepper counts, but "Table for 2" doesn't move. `App` passes a starting
value down and never hears about changes. Bind it instead:

```tsazor
<Stepper @bind-value="guests" />
```

Now both numbers move together. Every assignment inside the stepper reports the new number
up, `App` stores it in `guests` and re-renders, and the value flows back down. The parent
owns the state; whoever uses the stepper decides where the value lives.

**What `@Bindable()` means.** It's short for a parameter plus a change callback:

```ts
@Parameter() value = 0;
@Parameter() valueChanged?: EventCallback<number>;
```

— and assigning `this.value` sets the value *and* invokes `valueChanged` with it (assigning
the value it already has invokes nothing). `@bind-value`, in turn, is shorthand for passing
both:

```tsazor
<Stepper value="@guests" valueChanged="(value) => guests = value" />
```

So the convention is the whole contract: a parameter `x` plus an `EventCallback` named
`xChanged` make `@bind-x` work on any component, and `@Bindable()` writes that pair for you.
Without a binding, as you saw first, the component simply keeps its own value.

`accessor` is standard TypeScript (an auto-accessor). A decorator on a plain field can't see
assignments; one on an accessor can. Forget it and the compiler says so (TZS030), with a fix
that inserts it. The callback is a real, typed member too: code that has to wait for the
parent writes `await this.valueChanged?.invokeAsync(next)` itself.

This is the pattern for every reusable input — a date picker, a rating, a color chooser.
`@bind-value:after` works here as well, like on elements.
