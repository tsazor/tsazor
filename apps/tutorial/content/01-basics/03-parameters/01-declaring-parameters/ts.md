---
title: Declaring parameters
focus: App.tsazor
---

So far our components only had their own state. To pass data *into* a component — the way
attributes configure an HTML element — it declares **parameters**.

Pass an `answer` to `Nested` in `App.tsazor`:

```tsazor
<Nested answer="42" />
```

The problems panel objects right away: `Nested` doesn't have a parameter called `answer`. Its
field is private state as far as the outside world is concerned. Open `Nested.tsazor` and
mark the field as a parameter:

```ts
@Parameter() answer?: number;
```

`@Parameter()` is a decorator — standard TypeScript, nothing Tsazor-specific about the
syntax — and it's available in every `.tsazor` file without an import. The field stays an
ordinary field: you read it as `this.answer` in code and `@answer` in the markup. The
difference is that the parent may now set it — and when the parent renders again with a new
value, `Nested` gets the new value and renders too.

Notice the value arrives as the *number* 42, not the string `"42"`. The attribute is read
according to the parameter's type: for a `number` (or a boolean, an object, an array…) the
attribute value is a TypeScript expression — `answer="6 * 7"` passes 42 as well. Only a
`string` parameter takes the text as written.
