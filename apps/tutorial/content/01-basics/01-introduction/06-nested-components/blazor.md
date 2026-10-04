---
title: Nested components
keywords: nested components, child component, @using
focus: App.tsazor
---

Putting a whole app in one component would get unwieldy. Here's a second component,
`Nested.tsazor`. Use it in `App.tsazor` the way you would in Blazor:

```tsazor
<p>This is a paragraph.</p>
<Nested />
```

Notice that the styles from `App.tsazor.css` don't reach the paragraph inside `Nested`, even
though both are `<p>` elements: CSS isolation at work.

Tag resolution follows Blazor's rules, with folders standing in for namespaces: a tag that
starts with an uppercase letter is a component, and components in the same folder are visible
without further ado. For components elsewhere you write `@using ./Shared` (a folder, relative
to the file) or `@using @tsazor/components` (a package).

> **Coming from Blazor:** `@using` only brings in components (and `@inject` types). Values
> and types you use in *code* are imported explicitly with `@import` — a real TypeScript
> import, for example `@import { formatDate } from "./format"`. You can also import a
> component directly: `@import Nested from "./Nested.tsazor"`.
