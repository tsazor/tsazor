---
title: Rules on the model
focus: BreadOrder.ts
gate: click nav a:nth-child(3); click button
---

The rules go where you'd put DataAnnotations: on the model. Fill in `BreadOrder.ts`:

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

In `Bread.tsazor`, import it with `@import { BreadOrder } from "./BreadOrder.ts"`, create the
order with `new BreadOrder()`, and put a `<DataAnnotationsValidator />` inside the
`EditForm`. Clear the name and press Reserve: `handleOrder` no longer runs.

> **Coming from Blazor:** `[Required, MaxLength(40)]` becomes `@Required() @MaxLength(40)`.
> The set covers the everyday attributes — `Required`, `MinLength`, `MaxLength`,
> `StringLength`, `Range`, `EmailAddress`, `RegularExpression`, `Compare` — with .NET's
> messages word for word. The decorators are plain imports in a plain `.ts` file; there's no
> `_Imports` for code.
