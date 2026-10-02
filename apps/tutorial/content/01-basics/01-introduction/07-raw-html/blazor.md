---
title: Raw HTML
focus: App.tsazor
---

As in Blazor, strings are rendered as text: the `<strong>` in the preview shows up as
characters, not as bold. To render a string as HTML you wrap it in a `MarkupString` — which,
in TypeScript, you import first:

```tsazor
@import { MarkupString } from "@tsazor/runtime"

<p>@(new MarkupString(html))</p>
```

> **Coming from Blazor:** TypeScript has no cast operator that converts a value, so Razor's
> `@((MarkupString)html)` becomes either `@(new MarkupString(html))` or the TypeScript
> assertion `@(html as MarkupString)` — the compiler recognizes both and emits a markup frame.
> The `@import` is Tsazor's `@using`: values used in code always come from an explicit
> import. Projects usually put common imports into `_Imports.tsazor`, which works like
> `_Imports.razor`.

Tsazor doesn't sanitize the string — neither does Blazor. Only use `MarkupString` with HTML
you trust, or you open the door to cross-site scripting.

That's the end of the introduction. In the next chapter, we'll make components interactive.
