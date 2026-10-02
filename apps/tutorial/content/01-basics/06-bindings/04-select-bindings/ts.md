---
title: Select bindings
focus: App.tsazor
---

The paragraph says the selected question is about your mother — the dropdown shows the
school. `selected` and the `<select>` don't know about each other yet. Bind them:

```tsazor
<select @bind="selected">
```

Now the dropdown starts at the right option, and picking another one updates the paragraph.
`@bind` on a `<select>` works like on a text input: the field sets the selected value, and
the `change` event writes the chosen option's `value` back.

That value is always a string — option values are attribute text. That's why the questions
have string `id`s and the component finds the full object with a getter. If your ids are
numbers, convert them where you look them up: `Number(this.selected)`.

The options come from a `@foreach`, and `@bind` copes with that: the value is applied once
the options exist, and again if they change.
