---
title: Inline styles
focus: App.tsazor
---

The sliders are bound, but the text doesn't react. Usually styles belong in the component's
stylesheet — but when a value is truly dynamic, like a color picked by the user, put it in a
`style` attribute:

```tsazor
<p class="sample" style="color: hsl(@hue 80% 45%); font-size: @(size)rem">Hello, colorful world!</p>
```

Drag the sliders. The attribute is assembled from text and expressions, as in the first
chapter: `@hue` ends at the space, while `@(size)rem` needs the parentheses — without them,
the expression would try to read a member called `sizerem`.

A neat variation is to set only a CSS custom property and leave the actual styling to the
stylesheet:

```tsazor
<p class="sample" style="--hue: @hue">…</p>
```

```css
.sample {
    color: hsl(var(--hue) 80% 45%);
}
```

The markup then carries the data, the stylesheet the design — and the rule can use the
value in as many places as it likes.
