---
title: Dynamic attributes
focus: App.tsazor
---

Attributes take `@` expressions the way you're used to from Razor. Our image is missing its
`src` — let's add one:

```tsazor
<img src="@src" />
```

An image without alternative text isn't accessible to people using screen readers (or anyone
whose connection drops the image). Add an `alt` attribute:

```tsazor
<img src="@src" alt="A rocket takes off." />
```

Text and expressions mix freely inside an attribute value. Declare a `name` field in the
`@code` block, set it to `"A rocket"`, and change the attribute to:

```tsazor
<img src="@src" alt="@name takes off." />
```

> **Coming from Blazor:** the same attribute rules apply — a `null` or `undefined` value
> leaves the attribute out, `false` removes a boolean attribute such as `disabled`, and a
> bare attribute (`<input disabled>`) means `true`. Quoting is optional for simple values
> (`src=@src`), but quoting everything is the common style.
