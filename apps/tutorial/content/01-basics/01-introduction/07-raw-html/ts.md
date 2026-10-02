---
title: Raw HTML
focus: App.tsazor
---

Strings are always inserted as text. Characters like `<` and `>` have no special meaning —
which is why the preview shows the `<strong>` tags instead of bold text.

Sometimes you do need to render HTML, for example an article that comes from your CMS. For
that, wrap the string in a `MarkupString`. Import it from the runtime at the top of the
file — `@import` takes a regular TypeScript import declaration:

```tsazor
@import { MarkupString } from "@tsazor/runtime"

<p>@(new MarkupString(html))</p>
```

If you prefer, `@(html as MarkupString)` does the same thing.

Tsazor doesn't sanitize the HTML before inserting it into the DOM. That's fine for content you
control, but never use `MarkupString` with untrusted input — that's how cross-site scripting
attacks happen.

That's the end of the introduction. In the next chapter, we'll make components interactive.
