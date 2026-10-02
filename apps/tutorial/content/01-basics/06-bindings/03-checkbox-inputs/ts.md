---
title: Checkbox inputs
focus: App.tsazor
gate: check input
---

Checkboxes don't have a meaningful `value` — their state is `checked`. `@bind` knows that.
Replace the one-way `checked="@yes"`:

```tsazor
<input type="checkbox" @bind="yes" />
```

Tick the box: the message changes and the button is enabled. On a checkbox, `@bind` sets
the `checked` property from the field and writes the boolean back when the box is toggled.

Notice how little the rest of the component has to know. `yes` is an ordinary `boolean`;
the `@if` and the `disabled` attribute just read it. The binding is the only place that
deals with the DOM — and that's the point of `@bind`: your state stays plain data, and the
markup describes how it's connected to the page.
