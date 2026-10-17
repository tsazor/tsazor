---
title: Select bindings
keywords: @bind, select, dropdown, option
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

Option values are attribute text, but `@bind` reads the chosen one the way the field's value
is, as on a text input: a string field gets the string, a field that holds a number gets a
number — numeric ids work as well. Here the questions have string `id`s, and the component
finds the full object with a getter.

The options come from a `@foreach`, and `@bind` copes with that: the value is applied once
the options exist, and again if they change.
