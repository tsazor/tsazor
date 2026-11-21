---
title: Rules on the model
keywords: validation, DataAnnotationsValidator, Required, StringLength, EmailAddress
focus: BreadOrder.ts
gate: click nav a:nth-child(3); click button
---

The form accepts an empty name because it has no rules. Rules describe what a valid order
is, so they belong to the order itself, not to the page. Let's give the order its own class.

`BreadOrder.ts` is waiting for it. Declare the model there and put the rules on the fields
as decorators:

```ts
import { MaxLength, Range, Required } from "@tsazor/runtime";

export class BreadOrder {
    @Required() @MaxLength(40)
    name = "";

    @Range(1, 10)
    quantity = 1;

    bread = "sourdough";
    pickup = true;
}
```

Each decorator applies to the field below it, and a field can have several. Besides these
three there are `MinLength`, `StringLength`, `EmailAddress`, `RegularExpression` and
`Compare` (the field must equal another one, as in "repeat password"). `BreadOrder.ts` is a
plain TypeScript file, so it imports the decorators itself.

Now use the model in `Bread.tsazor`. Import it, create the order with
`order = new BreadOrder();`, and switch the rules on with one line inside the form:

```tsazor
@import { BreadOrder } from "./BreadOrder.ts"
```

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" class="order">
    <DataAnnotationsValidator />
    …
</EditForm>
```

`DataAnnotationsValidator` renders nothing. It tells the form to check the model's rules
when you submit. Like every component, it needs no import.

Clear the name and press Reserve. This time nothing happens: the form is invalid, so
`handleOrder` doesn't run. But it doesn't say *why* yet.
