---
title: Component bindings
keywords: component bindings, @Bindable(), valueChanged, two-way binding
focus: App.tsazor
gate: click .stepper button[aria-label=More]
---

Blazor's binding convention works as you know it: a `value` parameter plus a `valueChanged`
`EventCallback<number>` that the component invokes when it wants a new value:

```ts
@Parameter() value = 0;
@Parameter() valueChanged?: EventCallback<number>;

async change(delta: number) {
    await this.valueChanged?.invokeAsync(this.value + delta);
}
```

`Stepper.tsazor` uses the short form of exactly that pair, `@Bindable() accessor value = 0`
(a Tsazor extension, see below), and its buttons just assign `this.value`. `App` passes the
value but doesn't listen: the stepper counts on its own, "Table for 2" stays. Bind it:

```tsazor
<Stepper @bind-value="guests" />
```

Click **+**. As in Razor, `@bind-value` expands to `value="@guests"` plus a `valueChanged`
callback that assigns `guests` — after which `App` re-renders and the new value flows down
again. `@bind-value:after`, `:get`/`:set` and `:event` (a different change callback) work on
components too, with the pair and with the short form alike.

> **Tsazor extension — `@Bindable()`:** `@Bindable() accessor value = 0` desugars to the
> pair above plus one behavior: assigning `this.value` sets the value and invokes
> `valueChanged` with it — fire and forget, errors go to the `ErrorBoundary` like an event
> handler's, and an equal value (`Object.is`) invokes nothing. Values the parent passes never
> invoke it, and without a binding the component keeps its own value.
> `@Bindable({ changed: "onPick" })` names the callback for `@bind-value:event="onPick"`,
> `{ expression: true }` adds `valueExpression` for `EditContext`. `accessor` is standard
> TypeScript: only auto-accessor decorators see assignments (a plain field is TZS030, with a
> quick fix). The codemod keeps emitting the pair; the editor offers the conversion.

> **Coming from Blazor:** names follow camelCase: `[Parameter] public int Value` +
> `EventCallback<int> ValueChanged` become `@Parameter() value = 0` +
> `@Parameter() valueChanged?: EventCallback<number>`. Names are matched case-insensitively,
> so `@bind-Value` works as well. `ValueExpression` is passed only if the component declares
> that parameter — the forms chapter needs it.
