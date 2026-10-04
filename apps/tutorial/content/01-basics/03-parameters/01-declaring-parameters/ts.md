---
title: Declaring parameters
keywords: parameters, @Parameter(), type safety
focus: App.tsazor
---

So far our components only had their own state. To pass data *into* a component, the way
attributes configure an HTML element, it declares **parameters**.

Pass an `answer` to `Nested` in `App.tsazor`:

```tsazor
<Nested answer="42" />
```

The problems panel objects right away: `Nested` has no parameter called `answer`. Open
`Nested.tsazor` and mark the field as one:

```ts
@Parameter() answer?: number;
```

`@Parameter()` is a standard TypeScript decorator, available in every `.tsazor` file without
an import. The field stays an ordinary field (`this.answer` in code, `@answer` in markup),
but now the parent may set it, and `Nested` renders again when the value changes.

The value arrives as the *number* 42, not the string `"42"`: the attribute is read according
to the parameter's type. For a `number` it's an expression (`answer="6 * 7"` passes 42 too).
Only a `string` parameter takes the text as written.

That type is not optional. Tsazor always checks types strictly: a parameter without a type
is an error, and so is a value that doesn't fit, like a string passed to `answer`. Many
JavaScript frameworks accept whatever you pass, and you find the mistake when the page
breaks in the browser. Here it's a compile-time error instead: the problems panel shows it
while you type, before the app runs. (A default value such as `answer = 0` gives the field
its type too. That's the next lesson.)
