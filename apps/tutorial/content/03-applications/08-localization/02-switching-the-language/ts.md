---
title: Switching the language
keywords: CultureService, culture, language switch
focus: App.tsazor
gate: click .languages button:nth-child(2)
---

Make the language buttons work. They call `switchTo`, which does nothing yet. The current
language is held by the **culture service**. Inject it next to the localizer, and add
`CultureService` to the import:

```tsazor
@inject CultureService culture
```

Then set the culture in `switchTo`:

```ts
switchTo(name: string) {
    this.culture.setExplicit(name);
}
```

A culture is named by a language tag: `en-US` is English as used in the US, `de-DE`
German as used in Germany. `setExplicit` is for a choice the user made. It wins over a
language that, say, a user profile suggests later.

Click Deutsch. The heading and the greeting switch, and you didn't ask anything to render.
That's a choice Tsazor makes: every component that injects the localizer or the culture
service renders again when the culture changes. One call, and the whole app follows.
