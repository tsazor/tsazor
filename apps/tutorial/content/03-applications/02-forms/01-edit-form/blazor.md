---
title: The order form
keywords: EditForm, forms, InputText, OnValidSubmit
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

The Bread page has a hand-built form: plain inputs and a button that sets `submitted`. It
accepts an empty name without complaint. Time for the forms you know from Blazor.

Replace the wrapper `<div>` with an `EditForm`, make the button `type="submit"` (without the
`@onclick`), and swap the plain inputs for the input components:

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" class="order">
    <label>Name<InputText @bind="order.name" /></label>
    <label>How many<InputNumber @bind="order.quantity" /></label>
    …
    <button type="submit">Reserve</button>
</EditForm>
```

`InputSelect` and `InputCheckbox` replace the select and the checkbox. Press Reserve: still
accepted, because there are no rules yet.

> **Coming from Blazor:** `EditForm` has the parameters you know (`Model`, `EditContext`,
> `OnValidSubmit`, `OnInvalidSubmit`, `OnSubmit`) and cascades an `EditContext` to the
> inputs. On a component, `@bind` is your `@bind-Value`. There's no expression tree:
> instead of a `ValueExpression`, the compiler records the field name from the binding,
> which tells the form which field the input edits.
