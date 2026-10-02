---
title: Shared imports
focus: _Imports.tsazor
refactor: true
---

`_Imports.tsazor` is `_Imports.razor`: its directives apply to the files in its folder and
below, and files nearer to a component stack on top of those further up. Move the repeated
imports there:

```tsazor
@import type { RenderFragment } from "@tsazor/runtime"
@import { formatMoney } from "./money"
```

and remove them from `App`, `Box` and `Line`. The preview stays the same.

> **Coming from Blazor:** what `@using Microsoft.AspNetCore.Components.Web` did for types,
> `@import` does here — `@using` only covers component tags (folders like `@using ./Shared`,
> packages like `@using @tsazor/components`) and `@inject`/`@inherits` types. Relative
> specifiers are resolved against the `_Imports.tsazor` and rewritten per file; a binding in the
> component shadows an inherited one; unused imports are tree-shaken. `@layout` in
> `_Imports.tsazor` works as in Blazor, `@authorize` doesn't inherit (warning TZS014 — it's a
> per-page requirement). A typical standard set lives in the `_Imports.tsazor` of the demo apps.
