---
title: Passing values down
focus: App.tsazor
gate: check input
---

`CascadingValue` and `[CascadingParameter]`, as you know them. `ThemedButton` needs the theme
from `App`, two levels down. Wrap the toolbar:

```tsazor
<CascadingValue Value="@theme">
    <Toolbar />
</CascadingValue>
```

and turn the button's field into a cascading parameter:

```ts
@CascadingParameter() theme = "light";
```

Tick "Dark mode". Blazor's subscription model is ported: consumers of a non-fixed cascade
subscribe to it and get their parameters set when the value may have changed, so `Toolbar`
(no changed parameters) doesn't re-render. `IsFixed="true"` skips the subscriptions, and
changing `IsFixed` after the first render throws Blazor's error.

> **Coming from Blazor:** `[CascadingParameter] public string Theme { get; set; }` becomes
> `@CascadingParameter() theme = "light"` — a standard decorator on a field, the initializer
> serving as the value without a cascade. How an unnamed parameter finds its cascade is the
> topic of the next lesson: TypeScript has no runtime types to match on.
