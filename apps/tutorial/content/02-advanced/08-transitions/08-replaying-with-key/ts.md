---
title: Replaying with @key
keywords: @key, replay a transition, typewriter
focus: App.tsazor
gate: click button; look
---

The loading message has a typewriter intro, but click Next: the new message just appears. The
paragraph stays on the page and only its text changes, so there is nothing to play an intro
for.

Give the paragraph a `@key`:

```tsazor
<p @key="index" @in="typewriter()">@messages[index]</p>
```

`@key` tells Tsazor which element is which. When the key changes, the old paragraph is a
different element from the new one: the old one leaves, a new one enters — and plays its intro.
Click Next a few times.

You know `@key` from loops, where it keeps rows apart. It works on any element, and here that's
the point: a new key means a new element.
