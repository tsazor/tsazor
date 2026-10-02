---
title: Validation messages
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

Press Reserve with an empty name: nothing happens, and nothing tells you why. The form knows,
though. Every failed rule leaves a message, and you decide where it appears.

Put a `ValidationMessage` next to each input that has rules. `For` names the field:

```tsazor
<label>Name<InputText @bind="order.name" /><ValidationMessage For="name" /></label>
<label>How many<InputNumber @bind="order.quantity" /><ValidationMessage For="quantity" /></label>
```

Press Reserve again: "The name field is required." appears under the name. Every rule comes
with a ready-made message like this one. Set the quantity to 20 and you'll see
"The field quantity must be between 1 and 10." While a field is valid, its
`ValidationMessage` renders nothing.

Type a name, and the message disappears as soon as the field changes. Press Reserve once
more and the order goes through.

On a long form, a message far down the page is easy to miss. A `ValidationSummary` collects
all messages in one list. Add it at the top of the form:

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" class="order">
    <ValidationSummary />
    <DataAnnotationsValidator />
    …
```

Like the single messages, the summary stays empty until something is invalid.
