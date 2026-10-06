---
title: In and out
keywords: @in, @out, intro, outro
focus: App.tsazor
gate: check input; wait 600; look
---

Flying in looks good, but flying out takes just as long. Arriving can be slow; leaving should be
quick. Use separate transitions for the two directions — `@in` for the **intro**, `@out` for
the **outro**:

```tsazor
@import { fade, fly } from "@tsazor/runtime/transition"
```

```tsazor
<p @in="fly({ y: 200, duration: 2000 })" @out="fade">Flies in, fades out</p>
```

Unlike `@transition`, these two don't reverse: when the paragraph leaves during its intro, the
intro stops and the outro starts from the beginning. An element has either `@transition`, or
`@in` and `@out` (or one of them) — not both kinds.
