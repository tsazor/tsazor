---
title: Transition events
keywords: @onintrostart, @onintroend, @onoutrostart, @onoutroend, introstart, outroend, transition events
focus: App.tsazor
gate: check input; wait 50; look
---

Transitions fire DOM events on their element — `introstart`, `introend`, `outrostart`,
`outroend`. Handle them as usual:

```tsazor
<p @in="fly({ y: 200, duration: 2000 })"
   @out="fade"
   @onintrostart="() => status = 'intro started'"
   @onoutrostart="() => status = 'outro started'"
   @onintroend="() => status = 'intro ended'"
   @onoutroend="() => status = 'outro ended'">
    Flies in, fades out
</p>
```

`outroend` fires just before the element leaves the DOM.

> **Coming from Blazor:** like any event attribute, these re-render the component after the
> handler. In Blazor a custom event such as `introstart` needs an `[EventHandler]` registration
> (plus JS that raises it); in Tsazor every `@on…` attribute listens to the DOM event of that
> name.
