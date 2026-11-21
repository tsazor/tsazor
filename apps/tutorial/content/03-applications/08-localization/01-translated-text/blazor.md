---
title: Translated text
keywords: localization, StringLocalizer, translations, i18n
focus: App.tsazor
refactor: true
---

Move the texts out of the markup. `Texts.ts` has a table per language, and `Program.ts`
registers them. Inject the localizer and ask it by key:

```tsazor
@import { StringLocalizer } from "@tsazor/runtime"
@inject StringLocalizer L
<h1>@L.get("Title")</h1>
<p class="greeting">@L.get("Greeting", { name: "Marta" })</p>
```

The page looks the same as before.

> **Coming from Blazor:** `StringLocalizer` is your `IStringLocalizer`. The tables are plain
> objects instead of `.resx` files, and you write `L.get("Title")` instead of `L["Title"]`.
> Placeholders are named, as in .NET 8's composite format: `{name}`, filled from the object
> you pass. A missing key never throws: the current culture's table, then the default's,
> then the key.
