---
title: Translated text
focus: App.tsazor
refactor: true
---

The bakery wants its page in German too. The first step changes nothing you can see: take
the texts out of the markup. `Texts.ts` already has them, one table per language, and
`Program.ts` registers both, with English as the default.

Inject the **string localizer** in `App.tsazor`:

```tsazor
@import { StringLocalizer } from "@tsazor/runtime"
@inject StringLocalizer L
```

Then ask it for each text by its key:

```tsazor
<h1>@L.get("Title")</h1>
<p class="greeting">@L.get("Greeting", { name: "Marta" })</p>
```

`get` looks the key up in the current language's table. `{name}` in the text is a
placeholder, and the second argument fills it in. A key that's missing from a table falls
back to the default language, then to the key itself. A missing translation never breaks
the page.

The page looks exactly as before. The next lesson switches the language.
