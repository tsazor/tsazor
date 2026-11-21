---
title: Rules with context
keywords: custom validation, ModelValidator, validation
focus: Bread.tsazor
gate: click nav a:nth-child(3); change select rye; click button
---

Rye is sold out today. That's not a rule about orders in general — tomorrow there will be
rye again — so it doesn't belong on the model. It belongs to this form, today.

For rules like that, `EditForm` takes a `Validators` map: field name to function. Add it:

```tsazor
<EditForm Model="@order" Validators="@validators" OnValidSubmit="handleOrder" OnInvalidSubmit="handleInvalid" class="order">
```

```ts
validators: Record<string, ModelValidator> = {
    bread: (value) => (value === "rye" ? "Rye is sold out today — pick another bread." : null),
};
```

A validator gets the field's value and returns `null` if it's fine, or a message if it
isn't. The keys are the same field names you use in `For`. Import `ModelValidator` from
`@tsazor/runtime`, next to `EditContext`.

The message needs a place, too — add `<ValidationMessage For="bread" />` under the select.

Now pick rye: the message appears right away, because changing a field re-checks it. Press
Reserve and the submit is blocked, together with any message from the model's own rules.
Pick sourdough, and the order goes through.
