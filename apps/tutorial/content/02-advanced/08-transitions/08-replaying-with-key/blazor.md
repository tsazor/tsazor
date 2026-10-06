---
title: Replaying with @key
keywords: @key, replay a transition, typewriter
focus: App.tsazor
gate: click button; look
---

The message has a typewriter intro, but click Next: it changes without typing — the paragraph
is the same element, so no intro plays. A `@key` makes a new key a new element:

```tsazor
<p @key="index" @in="typewriter()">@messages[index]</p>
```

The old paragraph leaves, the new one enters and plays its intro.

> **Coming from Blazor:** this is Blazor's `@key` on a single element — a changed key means the
> old element is removed and a new one created, as you may know from resetting a component's
> state with `<Editor @key="document.Id" />`.
