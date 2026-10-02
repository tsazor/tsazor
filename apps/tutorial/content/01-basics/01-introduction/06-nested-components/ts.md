---
title: Nested components
focus: App.tsazor
---

Putting your whole app in a single component would quickly get unwieldy. Instead, you compose
it from smaller ones. Here's a second component, `Nested.tsazor`. Add it to `App.tsazor` as a
tag:

```tsazor
<p>This is a paragraph.</p>
<Nested />
```

A tag starting with an uppercase letter is a component; lowercase tags are HTML elements.
Components in the same folder are found automatically — no import needed. If you prefer to
be explicit (or the component lives elsewhere), import it at the top of the file:

```tsazor
@import Nested from "./Nested.tsazor"
```

Notice that the styles from `App.tsazor.css` don't reach the paragraph inside `Nested`, even
though both are `<p>` elements. Each component's styles are scoped to its own markup.
