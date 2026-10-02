---
title: Dynamic attributes
focus: App.tsazor
---

Just as `@` puts values into text, it puts values into attributes. Our image is missing its
`src` — let's add one:

```tsazor
<img src="@src" />
```

That's better. But an image without alternative text isn't accessible: screen readers have
nothing to announce, and neither does a browser whose connection dropped the image. Add an
`alt` attribute:

```tsazor
<img src="@src" alt="A rocket takes off." />
```

Text and expressions can be mixed inside an attribute value. Declare a `name` field in the
`@code` block, set it to `"A rocket"`, and change the attribute to:

```tsazor
<img src="@src" alt="@name takes off." />
```

A few rules worth knowing: when an expression evaluates to `null` or `undefined`, the
attribute is left out entirely. For boolean attributes like `disabled`, `false` removes the
attribute and `true` adds it.
