---
title: The invalid submit
keywords: EditContext, OnInvalidSubmit, validation, OnSubmit
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

The messages tell the user what's wrong. Sometimes your code wants to know too — to show a
status line, log the attempt, or move the focus. `OnValidSubmit` has a counterpart for that.
Add it to the form:

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" OnInvalidSubmit="handleInvalid" class="order">
```

Both callbacks receive the form's `EditContext`, the object that tracks the fields and their
messages. Let `handleInvalid` count the fields that need fixing:

```ts
handleInvalid(context: EditContext) {
    this.status = `${context.getInvalidFields().length} field(s) need a look.`;
}
```

Add a `status: string | null = null` field, clear it in `handleOrder`, and show it below the
button with an `@if`. `EditContext` is a class you name in code, so import it at the top:

```tsazor
@import { EditContext } from "@tsazor/runtime"
```

Press Reserve with an empty name: "1 field(s) need a look." Type a name and press again — the
status disappears and the order goes through.

Besides `getInvalidFields()`, the context answers `isValid()` for the whole form. If you'd
rather handle both cases yourself, use `OnSubmit` instead of the other two: it always runs.
