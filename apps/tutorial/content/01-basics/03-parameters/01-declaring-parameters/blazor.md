---
title: Declaring parameters
focus: App.tsazor
---

Parameters work as in Blazor; only the declaration is TypeScript. Pass an `answer` to
`Nested` in `App.tsazor`:

```tsazor
<Nested answer="42" />
```

The problems panel reports TZS025: `Nested` has no parameter `answer` — the compile-time
version of Blazor's "does not have a property matching the name" error. Declare it in
`Nested.tsazor`:

```ts
@Parameter() answer?: number;
```

As in Razor, the attribute is lowered by the parameter's type: `answer` is a `number`, so the
value is the expression `42` (and `answer="6 * 7"` would pass 42 too); a `string` parameter
takes the text as written.

> **Coming from Blazor:** `[Parameter] public int Answer { get; set; }` becomes the field
> `@Parameter() answer?: number;` — a TC39 decorator on a plain class field, no property
> needed, and no import (the compiler provides `Parameter`). Parameter names are matched
> case-insensitively, so `Answer="42"` works too; this tutorial writes attributes the way the
> field is declared. The `?` says "may be undefined": TypeScript has no default value for
> `int`, so an unset parameter is `undefined` unless you give it a default — the next
> lesson.
