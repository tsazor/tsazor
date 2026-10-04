---
title: Styling child components
keywords: ::deep, CSS isolation, child components
focus: App.tsazor.css
---

`App` wants its boxes purple and rounded, and its stylesheet has a `.box` rule for that.
Nothing happens: the `<div class="box">` elements belong to `Box.tsazor`, and the scoping
you met in the first chapter keeps `App`'s rules away from them.

Most of the time that's exactly what you want — a child's look is the child's business. When
a parent does need to reach in, it says so explicitly with `::deep`:

```css
.boxes ::deep .box {
    background: #c4b5fd;
    border-radius: 12px;
}
```

The part before `::deep` stays scoped to `App` — it must match an element in `App`'s own
markup, here the `.boxes` wrapper. The part after it isn't scoped, so it matches any
`.box` *inside* that wrapper, whichever component rendered it. The compiled rule is
`.boxes[b-…] .box`.

A rule may also start with `::deep` (`::deep .box` becomes `[b-…] .box`); then any element
of `App` is the anchor. Naming the wrapper is more precise: wrap the children in an element
you own, and the reach stays limited to them.

That's the end of the basics! You can now build interactive components: state, rendering,
parameters, logic, events, bindings and styles. Part 2 covers what makes components
reusable — passing markup into them, sharing values down a tree, and services.
