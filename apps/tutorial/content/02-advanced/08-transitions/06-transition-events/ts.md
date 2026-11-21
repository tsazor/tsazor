---
title: Transition events
keywords: @onintrostart, @onintroend, @onoutrostart, @onoutroend, introstart, outroend, transition events
focus: App.tsazor
gate: check input; wait 50; look
---

Sometimes your code needs to know where a transition is — to start the next step once the
paragraph has arrived, or to log that it left. The status line says "waiting…" forever.

An element with transitions fires four events: `introstart`, `introend`, `outrostart` and
`outroend`. Handle them like any other event:

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

Toggle the box and follow the status. "outro ended" shows up although the paragraph is gone by
then: the handler runs just before the element is removed, and the status line lives on.
