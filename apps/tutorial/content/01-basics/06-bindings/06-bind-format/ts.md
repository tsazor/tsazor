---
title: Formatted bindings
keywords: @bind:format, date input, formatting
focus: App.tsazor
---

The price box shows `4.5`. For money you'd rather see `4.50`. `@bind:format` controls how
the bound value is turned into text — and how the text is parsed back:

```tsazor
<input type="number" step="0.01" min="0" @bind="price" @bind:format="F2" />
```

`F2` means "fixed, two decimals". Type `3.14159` and leave the field: `price` gets the
parsed number (the sentence uses all its digits), and the box shows `3.14`. `F0`, `F3` and
so on work the same way, as do digit masks like `0.000`.

The date input needed nothing at all: a `Date` bound to `<input type="date">` is always
written as `yyyy-MM-dd`, the only format that input understands, and read back as a local
date. Pick another day and the sentence follows.

Formats are deliberately simple and locale-independent: the same input shows the same
text on every machine. When you need more — a currency symbol, a localized date — format
it for display with `Intl.NumberFormat` or `toLocaleDateString()`, and keep the bound
input plain.
