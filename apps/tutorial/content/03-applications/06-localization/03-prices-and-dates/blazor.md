---
title: Prices and dates
focus: App.tsazor
gate: click .languages button:nth-child(2)
---

Format the price and the date with the current culture:

```tsazor
<span class="price">@culture.current.formatNumber(price, { style: "currency", currency: "EUR" })</span>
```

```tsazor
<p class="baked">@L.get("Baked", { date: culture.current.formatDate(bakedOn, { dateStyle: "long" }) })</p>
```

Switch to Deutsch: 3,40 € and 5. Oktober 2026.

> **Coming from Blazor:** this is `price.ToString("C", culture)`, with `Intl` options instead
> of .NET format strings. For inputs, `@bind:culture` works on number binds. Dates stay ISO
> there, a deliberate limit. As in .NET, the value stays invariant and only its display is
> localized.
