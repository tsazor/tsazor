---
title: Shared imports
keywords: _Imports, @using, shared imports
focus: _Imports.tsazor
refactor: true
---

Look at the tops of `App.tsazor`, `Box.tsazor` and `Line.tsazor`: the same imports, again and
again. As an app grows, every component starts with the same handful of lines — the runtime
types, your formatting helpers, the component folders.

`_Imports.tsazor` is the place for them. Its directives apply to every `.tsazor` file in its
folder and in all folders below. Move the imports there:

```tsazor
@import type { RenderFragment } from "@tsazor/runtime"
@import { formatMoney } from "./money"
```

and delete them from the three components. Nothing changes in the preview — but `Line` is now
just markup and parameters.

The details:

- Relative paths are written relative to `_Imports.tsazor`. A component in a subfolder gets
  `"./money"` rewritten to `"../money"` automatically.
- `@using ./widgets` in it makes the components of that folder available as tags everywhere
  below.
- Several `_Imports.tsazor` files stack: one in a subfolder adds to the one above it, and an
  import in the component itself wins over an inherited one with the same name.
- Unused imports cost nothing — the build drops them. A generous `_Imports.tsazor` is fine.
- It's not a component: it has no markup and isn't rendered.

`_Imports.tsazor` only affects `.tsazor` files. A plain `.ts` module — a service, a code-behind
— imports what it uses itself, like any TypeScript file.
