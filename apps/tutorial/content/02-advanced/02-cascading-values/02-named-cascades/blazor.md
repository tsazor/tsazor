---
title: Names and types
focus: Greeting.tsazor
---

`Greeting` says *theme: de, language: de*. Blazor would do the same here — two unnamed
`string` cascades, and both `string` parameters get the inner one. The fix is the same, too:
names.

```tsazor
<CascadingValue Value="@theme" Name="theme">
    <CascadingValue Value="@language" Name="language">
        <Greeting />
    </CascadingValue>
</CascadingValue>
```

```ts
@CascadingParameter({ name: "theme" }) theme = "light";
@CascadingParameter({ name: "language" }) language = "en";
```

Name matching is Blazor's: case-insensitive, and named and unnamed never mix.

> **Coming from Blazor — matching by type:** Blazor matches an unnamed `[CascadingParameter]`
> by its declared type (`typeof(TValue).IsAssignableFrom`). TypeScript has no property types at
> runtime, so the type is passed explicitly: `@CascadingParameter({ type: Session }) session?:
> Session`, matched with `instanceof` against the cascaded value (or against the supplier's
> declared type — `EditForm` and `CascadingAuthenticationState` declare theirs). An unnamed
> parameter **without** `type` takes the nearest unnamed cascade, whatever its value — so in
> Tsazor even a `string` and a `number` cascade collide where Blazor's types would keep them
> apart. Name them, or pass `type`.
