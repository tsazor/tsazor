---
title: Rules on the model
focus: BreadOrder.ts
gate: click nav a:nth-child(3); click button
---

Press Reserve with an empty name: "Reserved: 1 × sourdough for ." — `OnValidSubmit`
ran, because with no rules everything is valid. The form keeps that promise; it
just has nothing to check yet.

> **Coming from Blazor:** the rules are your DataAnnotations, one per
> attribute — `[Required, MaxLength(40)]` becomes `@Required() @MaxLength(40)`
> on the model field, and the messages are .NET's exact DataAnnotations texts.
> `DataAnnotationsValidator` is the same component with the same name; only
> `For` differs — no expression tree, so `ValidationMessage` takes the field
> name as a plain string (`For="name"`), the same name `@bind` records.

Where do rules belong? Not on the page — the shape of an order is the order's
business. Give the model its own file and put the rules on the fields:

```ts
export class BreadOrder {
    @Required() @MaxLength(40)
    name = "";

    @Range(1, 10)
    quantity = 1;

    bread = "sourdough";
    pickup = true;
}
```

`@Required()`, `@MaxLength()`, `@Range()` are validation decorators — a rule
applies to the field under it, and a field can stack several. The set covers
the everyday shapes: `Required`, `MinLength`, `MaxLength`, `StringLength`,
`Range`, `EmailAddress`, `RegularExpression` and `Compare` (the value must
equal another field — for password confirmations).

Decorators and the model are plain TypeScript — so they are imported the plain
way, at the top of the file, like the page imports them:

```ts
import { MaxLength, Range, Required } from "@tsazor/runtime";
```

That is a trap worth knowing — or half of one: everything that renders in
markup auto-imports — `EditForm`, the `Input*` family, and the component that
runs the rules below. The rule decorators are not markup, they are code, so
the model's file imports them itself. Declare the model in `BreadOrder.ts`,
import it in `Bread.tsazor`, and enable the rules inside the form — one line,
before the fields:

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" class="order">
    <DataAnnotationsValidator />
    …
</EditForm>
```

`DataAnnotationsValidator` renders nothing; it tells the form's context to run
the model's rules — the same cascaded `EditContext` your inputs already live
on. The context knows which input edits which field — the `@bind` set that up
in the last lesson — so each rule finds its value.

Last piece: somewhere for the message. `ValidationMessage` names a field:

```tsazor
<label>Name<InputText @bind="order.name" /><ValidationMessage For="name" /></label>
```

It renders nothing while the field is valid — then its message, right where it
belongs. Press Reserve now: the name's message appears and the success
paragraph does not. `OnValidSubmit` finally means something.