---
title: Text inputs
keywords: @bind, binding, text input, two-way binding
focus: App.tsazor
gate: change input Tsazor
---

Data flows down: the field sets the input's value. Type something into the box, press
Enter — the heading doesn't care. The input has its own value now, and nothing writes it
back to `name`.

You could add an `@onchange` handler that assigns `event.target.value`. That's so common
that there's a shortcut, `@bind`:

```tsazor
<input @bind="name" />
```

Type a name and press Enter (or click elsewhere). `@bind` is two things at once: the input
shows `name`, and when the input changes, its value is written to `name` — after which the
component renders, as after any event.

By default the value is written on the `change` event: when you commit the edit, not on
every keystroke. That's often what you want for forms; a few lessons on, you'll make it
update while typing.

`@bind` needs something it can assign to: a field, `user.name`, `items[i]`. A function call
or `a?.b` can't be assigned, and the compiler tells you so; a getter without a setter is
caught by the type check.
