---
title: Validation messages
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

The form refuses an empty name but doesn't say why. Add the message components you know: a
`ValidationMessage` next to each input with rules, and a `ValidationSummary` at the top of
the form:

```tsazor
<ValidationSummary />
<DataAnnotationsValidator />
<label>Name<InputText @bind="order.name" /><ValidationMessage For="name" /></label>
<label>How many<InputNumber @bind="order.quantity" /><ValidationMessage For="quantity" /></label>
```

Press Reserve: "The name field is required." appears in both places.

> **Coming from Blazor:** the only difference is `For`. Without expression trees, it takes
> the field name as a string — `For="name"` instead of `For="@(() => order.Name)"`. It's the
> same name that `@bind="order.name"` records.
