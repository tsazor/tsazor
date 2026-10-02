---
title: Inline styles
focus: App.tsazor
---

Make the text follow the sliders with an inline style:

```tsazor
<p class="sample" style="color: hsl(@hue 80% 45%); font-size: @(size)rem">Hello, colorful world!</p>
```

Drag the sliders. The implicit `@hue` ends at the space; `@(size)rem` needs the explicit
form, otherwise the expression would be `sizerem` — the same rules as in Razor.

Setting a CSS custom property and leaving the rest to the scoped stylesheet often reads
better:

```tsazor
<p class="sample" style="--hue: @hue">…</p>
```

```css
.sample {
    color: hsl(var(--hue) 80% 45%);
}
```

> **Coming from Blazor:** numbers are rendered with JavaScript's conversion, which is
> culture-independent: `@size` with `2.5` always gives `2.5rem`, never `2,5rem` — a
> classic Blazor pitfall on German or French machines that can't happen here.
