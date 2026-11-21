---
title: In and out
keywords: @in, @out, intro, outro
focus: App.tsazor
gate: check input; wait 600; look
---

Slow in, quick out: `@in` sets the intro, `@out` the outro.

```tsazor
@import { fade, fly } from "@tsazor/runtime/transition"
```

```tsazor
<p @in="fly({ y: 200, duration: 2000 })" @out="fade">Flies in, fades out</p>
```

They don't reverse: leaving during the intro stops it and starts the outro. `@transition`
together with `@in`/`@out` on one element is an error (TZS008).
