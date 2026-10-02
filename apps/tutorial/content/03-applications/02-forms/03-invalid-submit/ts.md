---
title: The invalid submit
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

Submit with an empty name and the form quietly refuses: the message appears,
no success. But the page never says *what happened* — the user sees no submit
at all, and the code has no place to react. `OnValidSubmit` got its meaning;
its counterpart is missing:

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" OnInvalidSubmit="handleInvalid" class="order">
```

The two callbacks receive the form's `EditContext` — the same context the
inputs live on — and it answers questions about the failed submit:

```ts
handleInvalid(context: EditContext) {
    this.status = `${context.getInvalidFields().length} field(s) need a look.`;
}
```

`getInvalidFields()` names the fields with messages; `isValid()` answers the
whole model. `EditContext` comes from the runtime package, imported the plain
way — auto-imports cover what renders, not a class your code names.

One message per field, next to its input, covers most forms. When there are
many fields — or the messages end up far below the fold — a summary at the top
collects them all:

```tsazor
<ValidationSummary />
```

It renders nothing while the form is valid; after a failed submit, one list of
every message. (That is why the page's import line grows: `EditContext` comes
from the runtime package, imported the plain way — the
`DataAnnotationsValidator` tag needs no import.)

Press Reserve: the list names the name, the status line counts, and the
success paragraph stays away. Fill the name and press again: the summary
empties, the status clears, the reserve goes through — the invalid state is not
a dead end, it's a conversation.