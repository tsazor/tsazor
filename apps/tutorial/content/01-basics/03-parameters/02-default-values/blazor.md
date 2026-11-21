---
title: Default values
keywords: default values, parameters, optional parameter
focus: Nested.tsazor
---

The second `<Nested />` passes no answer; its parameter stays `undefined` and renders as
nothing. A default is a field initializer — as in C#:

```ts
@Parameter() answer = "a mystery";
```

The type is inferred from the initializer (`string`), and Tsazor lowers the attribute
accordingly: `answer="42"` passes the text `"42"`. Annotate when the initializer doesn't say
enough: `@Parameter() items: string[] = [];`.

> **Coming from Blazor:** Blazor's rules apply unchanged: the initializer runs at
> construction, a passed value overwrites it, and a parameter the parent stops passing
> keeps its last value (it isn't reset to the default). What's different is the fallback
> without an initializer: `undefined`, not `default(T)` — so `@Parameter() count?: number`
> renders as nothing, where C#'s `int Count` would render `0`.
