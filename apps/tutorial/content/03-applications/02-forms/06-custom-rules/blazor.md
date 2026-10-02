---
title: Rules with context
focus: Bread.tsazor
gate: click nav a:nth-child(3); change select rye; click button
---

"Rye is sold out today" isn't a rule about orders, so it doesn't go on the model. Pass it to
the form instead, as a function per field:

```tsazor
<EditForm Model="@order" Validators="@validators" OnValidSubmit="handleOrder" OnInvalidSubmit="handleInvalid" class="order">
```

```ts
validators: Record<string, ModelValidator> = {
    bread: (value) => (value === "rye" ? "Rye is sold out today — pick another bread." : null),
};
```

Import `ModelValidator` from `@tsazor/runtime` and add `<ValidationMessage For="bread" />`
under the select. Pick rye: the message appears immediately.

> **Coming from Blazor:** this replaces what you'd build with a custom
> `ValidationAttribute`, `IValidatableObject` or a second validator component. A function
> returns `null` or a message. Its messages live alongside those of
> `DataAnnotationsValidator`, and both block the submit.
