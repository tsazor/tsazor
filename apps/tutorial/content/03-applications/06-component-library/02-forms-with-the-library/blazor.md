---
title: Forms with the library
keywords: Form, TextInput, Select, NumberInput, Validators, help text, validation message
focus: App.tsazor
gate: click button[type=submit]
---

The library's `Form` is `EditForm` with the skin's look; its inputs bring label, help text and
message. Press Reserve empty — it goes through. Give the form rules:

```tsazor
<Form Model="@order" Validators="@rules" OnValidSubmit="reserve">
```

```ts
rules = {
    name: (value: unknown) => (value ? null : "Enter a name."),
    bread: (value: unknown) => (value ? null : "Choose a bread."),
};
```

and a hint: `<TextInput Label="Name" Help="As it should appear on the order." … />`.

> **Coming from Blazor:** `<MudForm>`/`<MudTextField Label HelperText>` territory. The rules are
> functions here instead of DataAnnotations (the Forms chapter shows both); the messages appear
> after the first submit, linked to their inputs with `aria-describedby`.
