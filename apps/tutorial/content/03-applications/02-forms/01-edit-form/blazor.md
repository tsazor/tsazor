---
title: The order form
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

The menu's Bread link has been a dead end — the lost page answered. Time for the
real thing: a form that reserves a loaf for pickup.

`Bread.tsazor` already holds a hand-rolled version. Inputs bound to an `order`
object, a button, a handler that flips `submitted`. It works — except it trusts
you completely. Clear the name and press Reserve: "Reserved: 1 × sourdough for
." The button collects nothing; it just says thanks.

A form deserves better plumbing than one button and your optimism. Swap the
wrapper for `EditForm`:

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" class="order">
    …
    <button type="submit">Reserve</button>
</EditForm>
```

> **Coming from Blazor:** that's `<EditForm Model="@order" OnValidSubmit="@HandleOrder">`
> — same parameters (`Model`, `EditContext`, `OnValidSubmit`/`OnInvalidSubmit`/
> `OnSubmit`), same cascaded `EditContext` to the inputs, and `EditForm` is
> auto-imported like any built-in component.

Inside, the plain inputs become components that know they live in a form:

```tsazor
<label>Name<InputText @bind="order.name" /></label>
<label>How many<InputNumber @bind="order.quantity" /></label>
```

`@bind` on a component is your `@bind-Value` — the same Value/ValueChanged/
ValueExpression triple, minus the expression: Tsazor's `ValueExpression` is the
field name the compiler emits from the binding. `@bind` also tells the form
*which model field* the input edits. The family covers the usual inputs —
`InputText`, `InputTextArea`, `InputNumber`, `InputCheckbox`, `InputDate`,
`InputSelect` with its options as child content — and each one passes
attributes through, so a placeholder or a `min` lands on the element.

Press Reserve: same message — but "valid" was the form's word now, not the
button's. With no rules declared, everything is valid; that changes in the next
lesson.