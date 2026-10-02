---
title: Styling child components
focus: App.tsazor.css
---

`App.tsazor.css` has a `.box` rule, but the boxes are `Box`'s elements, so CSS isolation
keeps the rule from matching. Reach into the children with `::deep`:

```css
.boxes ::deep .box {
    background: #c4b5fd;
    border-radius: 12px;
}
```

It compiles to `.boxes[b-…] .box`, exactly as in Blazor: the selector before `::deep` is
scoped to `App` (so `.boxes` must be an element in `App`'s own markup), everything after it
is not.

> **Coming from Blazor:** `::deep` has Blazor's semantics, including the rule of thumb to
> wrap child components in an element of your own so the deep selector has a scoped anchor.
> The only difference in this area is packaging: there's no bundled `{App}.styles.css` —
> each component's scoped stylesheet is injected along with the component.

That's the end of the basics. Part 2 covers the parts of the component model that make
components reusable: `ChildContent` and templates, cascading values, services and
`@inject`, element references and the special components.
