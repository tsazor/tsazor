---
title: Forms with the library
keywords: Form, TextInput, Select, NumberInput, Validators, help text, validation message
focus: App.tsazor
gate: click button[type=submit]
---

This order form is built from the library: `Form`, `TextInput`, `Select`, `NumberInput`. Press
Reserve with nothing filled in — "Reserved: 1 ×  for ." It accepts anything.

`Form` is the Forms chapter's `EditForm` with the skin's look, and its inputs are the input
components with a label, a help text and a message slot built in. Give the form its rules:

```tsazor
<Form Model="@order" Validators="@rules" OnValidSubmit="reserve">
```

```ts
rules = {
    name: (value: unknown) => (value ? null : "Enter a name."),
    bread: (value: unknown) => (value ? null : "Choose a bread."),
};
```

A rule returns the message, or `null` when the value is fine. Press Reserve again: the two fields
turn red and say what's missing, and Reserve doesn't go through. Fill them in and the messages go.

Add a hint to the name field: `Help="As it should appear on the order."`. Every input takes
`Label` and `Help`; the help text and the message are linked to the input, so a screen reader
reads them with it.

> **Tsazor chooses messages after the first submit.** Before anyone pressed Reserve, an empty
> required field isn't an error yet — red text while someone is still typing gets in the way. The
> field colors follow every change; the messages appear with the first submit attempt.
