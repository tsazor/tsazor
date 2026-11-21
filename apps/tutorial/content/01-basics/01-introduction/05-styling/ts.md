---
title: Styling
keywords: CSS isolation, scoped styles, .tsazor.css
focus: App.tsazor.css
---

A component's styles live in a stylesheet next to it, named after the component: `App.tsazor`
gets `App.tsazor.css`. Styles in that file are **scoped** — they apply to this component's
markup and nothing else.

Open `App.tsazor.css` and give the paragraph some style:

```css
p {
    color: goldenrod;
    font-family: "Comic Sans MS", cursive;
    font-size: 2em;
}
```

How does the scoping work? The compiler adds an attribute such as `b-1a2b3c4d` to every
element in `App.tsazor`, and rewrites each selector in the stylesheet to require it — `p`
becomes `p[b-1a2b3c4d]`. A rule written here can't accidentally restyle the rest of your
app. We'll see that in action in the next lesson.

The stylesheet is plain CSS: media queries, `@supports` and `@keyframes` work as usual.
