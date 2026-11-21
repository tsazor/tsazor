---
title: The order form
keywords: EditForm, forms, InputText, OnValidSubmit
focus: Bread.tsazor
gate: click nav a:nth-child(3); click button
---

The Bread link has a page now: a form to reserve a loaf. It's built by hand — inputs bound
to an `order` object and a button that sets `submitted`. Clear the name and press Reserve:
"Reserved: 1 × sourdough for ." The form accepts anything.

To check input, the form first needs to know what it's editing. That's the job of
`EditForm`. Replace the wrapper with it:

```tsazor
<EditForm Model="@order" OnValidSubmit="handleOrder" class="order">
    …
    <button type="submit">Reserve</button>
</EditForm>
```

`Model` is the object the form edits. `OnValidSubmit` runs when the form is submitted and
everything is valid. Make the button `type="submit"` and drop its `@onclick` — now both the
button and the Enter key submit the form.

Next, swap the plain inputs for the form's input components:

```tsazor
<label>Name<InputText @bind="order.name" /></label>
<label>How many<InputNumber @bind="order.quantity" /></label>
```

They bind like `<input @bind>`, but they also tell the form which field of the model they
edit. There's one for each common input: `InputText`, `InputTextArea`, `InputNumber`,
`InputCheckbox`, `InputDate` and `InputSelect` (with the options as child content). Extra
attributes such as `placeholder` or `min` are passed on to the element.

Press Reserve with an empty name: still accepted. The form has no rules yet, so everything
counts as valid. That's the next lesson.
