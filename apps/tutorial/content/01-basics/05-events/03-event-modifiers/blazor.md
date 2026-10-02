---
title: Event modifiers
focus: App.tsazor
gate: click .card button
---

Click **Archive**: the log says "archived, opened" — the click bubbled up to the card. Stop
it with the modifier you know:

```tsazor
<button @onclick="archive" @onclick:stopPropagation>Archive</button>
```

`@on{event}:stopPropagation` and `@on{event}:preventDefault` have Blazor's semantics: they
work without a handler (`<form @onsubmit:preventDefault>`), take an optional bool
expression that's re-evaluated on every render (`@onclick:stopPropagation="isNested"`), and
on a component they're ordinary attributes that end up in its `@attributes`.

> **Coming from Blazor:** you've learned to use the modifiers because Blazor *can't* call
> `preventDefault()` from C# — the handler runs after the browser has finished dispatching
> the event. In Tsazor the handler runs synchronously inside the dispatch, so
> `event.preventDefault()` and `event.stopPropagation()` in the handler work as well. The
> modifiers remain the declarative choice — and the only one that works without a handler.
