---
title: Styling
focus: App.tsazor.css
---

CSS isolation works exactly like in Blazor: a stylesheet next to the component, named after
it — `App.tsazor.css` instead of `App.razor.css` — applies to that component only.

Open `App.tsazor.css` and give the paragraph some style:

```css
p {
    color: goldenrod;
    font-family: "Comic Sans MS", cursive;
    font-size: 2em;
}
```

Behind the scenes, it's the mechanism you know: the compiler stamps a `b-<hash>` attribute on
every element of `App.tsazor`, and the selectors in the stylesheet are rewritten to require
it (`p[b-1a2b3c4d]`). So `p` here only matches paragraphs written in this file. We'll see that
in action in the next lesson.

> **Coming from Blazor:** `::deep` is supported, with the same semantics, and so are
> `@media`, `@supports` and `@keyframes`. There's no bundled `.styles.css` file to link: the
> Vite plugin injects each component's stylesheet with the component.
