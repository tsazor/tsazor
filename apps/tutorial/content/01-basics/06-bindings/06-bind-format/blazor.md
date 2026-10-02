---
title: Formatted bindings
focus: App.tsazor
---

Show the price with two decimals:

```tsazor
<input type="number" step="0.01" min="0" @bind="price" @bind:format="F2" />
```

Type `3.14159` and leave the field: the box shows `3.14`, `price` holds the parsed
`3.14159`. The date input needs no format — like Blazor, a date input binds through
`yyyy-MM-dd` by default.

> **Coming from Blazor:** `@bind:format` is a documented subset of .NET formatting, always
> with the invariant culture (`@bind:culture` is an error): number formats `F<n>`, `N<n>`
> and digit masks (`0.00`, `#,##0.0`), and the date tokens `yyyy MM dd HH mm ss` (plus
> `yy M d H m s`). It applies to `type="number"`, `type="range"` and `type="date"` inputs.
> The common Blazor idiom — a *text* input bound to a `DateTime` with
> `@bind:format="dd.MM.yyyy"` — isn't supported: the compiler can't see that the field is a
> `Date`, treats the bind as a string bind and warns (TZS008) that the format has no effect.
> Use `type="date"`, or `@bind:get`/`@bind:set` with your own formatting.
