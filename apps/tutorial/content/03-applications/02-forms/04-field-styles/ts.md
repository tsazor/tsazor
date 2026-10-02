---
title: Field styles
focus: Bread.tsazor.css
gate: click nav a:nth-child(3); click button
---

The form speaks in sentences now. But fields should speak in color — red border
when invalid, green once the fix lands. Nobody writes that logic: the inputs
already carry their validation state as a class. Submit with an empty name and
inspect the name input — its class changed:

```html
<input class="invalid" value="">
```

The form's context tracks every bound field, and the inputs ask it on each
render. Four states, four classes: `valid` and `invalid` before the field was
ever touched, `modified valid` and `modified invalid` after. Type a name and
the input flips to `modified valid` — no page code involved.

So the styles come free — except they don't match. Your stylesheet is scoped to
the page's markup, and the input is *not* the page's markup: `InputText`
renders it, inside the form `EditForm` renders. The scope attribute your
selectors rely on lands on elements you wrote yourself — `label`, `button`,
`div` — never inside another component's output. That's the point of scoping;
for the inputs you need to say so explicitly, with the `::deep` marker:

```css
label ::deep input.invalid,
label ::deep select.invalid {
    border-color: #b3261e;
}
```

Everything before `::deep` stays scoped, everything after it applies unchecked:
`label ::deep input.invalid` reads as "an invalid input, somewhere below one of
my labels". The `validation-message` spans and the summary list are rendered by
components too — same marker, from a scoped anchor (`::deep .validation-message`
finds the span under any element of this page; `.summary ::deep
.validation-summary` styles the list under the page's own summary div).

Add the red borders, the red messages and the green `modified valid` to
`Bread.tsazor.css`. Submit empty: both borders and messages go red. Fix the
name: the input's class flips, and the border follows — the conversation, now
in color.