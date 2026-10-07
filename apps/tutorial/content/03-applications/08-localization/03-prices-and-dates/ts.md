---
title: Prices and dates
keywords: formatNumber, formatDate, Intl, culture
focus: App.tsazor
gate: click .languages button:nth-child(2)
---

Click Deutsch: the texts are German, but the price still reads €3.40 and the date
2026-10-05. Numbers and dates are written differently in every language. Format them with
the current culture:

```tsazor
<span class="price">@culture.current.formatNumber(price, { style: "currency", currency: "EUR" })</span>
```

```tsazor
<p class="baked">@L.get("Baked", { date: culture.current.formatDate(bakedOn, { dateStyle: "long" }) })</p>
```

`culture.current` is the culture in use. `formatNumber` and `formatDate` take the
browser's standard formatting options (`Intl`). In English the price reads €3.40 and the
date October 5, 2026. In German they read 3,40 € and 5. Oktober 2026.

Only the display changes. `price` stays the number 3.4 in your code, and data you send to
a server keeps one fixed format. Format a value when you show it, not when you store it.
