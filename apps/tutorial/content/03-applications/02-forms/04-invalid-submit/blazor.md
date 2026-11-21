---
title: The invalid submit
keywords: EditContext, OnInvalidSubmit, validation
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

Let the code react to a failed submit as well. Add `OnInvalidSubmit` and a handler that
counts the invalid fields:

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" OnInvalidSubmit="handleInvalid" class="order">
```

```ts
handleInvalid(context: EditContext) {
    this.status = `${context.getInvalidFields().length} field(s) need a look.`;
}
```

Add the `status` field (cleared in `handleOrder`), show it with an `@if`, and import the type
with `@import { EditContext } from "@tsazor/runtime"`.

> **Coming from Blazor:** as in Blazor, both callbacks receive the `EditContext`. Two
> helpers are new: `getInvalidFields()` lists the fields that have messages, and `isValid()`
> tells you whether there are none — no need to go through `GetValidationMessages()`
> yourself. Validation is synchronous, because the rules are plain functions.
