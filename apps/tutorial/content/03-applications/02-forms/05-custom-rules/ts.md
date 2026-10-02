---
title: Rules with context
focus: Bread.tsazor
gate: click nav a:nth-child(3); change select rye; click button
---

`@Range(1, 10)` lives on the model because it describes what an order *is*. But
"Rye is sold out today" is not a law of orders — it's today's truth, and
tomorrow it's gone. Rules with context don't belong on the model; they belong
to the form. `EditForm` takes them as a map — field name to function:

```tsazor
<EditForm Model="@order" Validators="@validators" OnValidSubmit="handleOrder" OnInvalidSubmit="handleInvalid" class="order">
```

```ts
validators: Record<string, ModelValidator> = {
    bread: (value) => (value === "rye" ? "Rye is sold out today — pick another bread." : null),
};
```

A validator is a plain function: the field's new value comes in, `null` means
fine, a message means not. The map's keys name the fields — the same names
`@bind` records and `ValidationMessage`'s `For` uses. `ModelValidator` is
imported from the runtime package like the other non-component names.

The map runs at the same moments as the model's rules — when a field changes
and when the form submits — and its messages land beside theirs: add
`<ValidationMessage For="bread" />` under the select and the sold-out line
appears right there. Both layers coexist; each owns its messages.

Pick rye: the message appears *immediately* — a change revalidates that field,
nobody waits for the submit. Press Reserve: blocked, the status counts. Pick
sourdough instead: the message goes away, the submit goes through. Tomorrow's
bakery just edits the map.