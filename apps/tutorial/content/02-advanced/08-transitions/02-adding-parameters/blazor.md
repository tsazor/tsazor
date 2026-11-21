---
title: Adding parameters
keywords: transition parameters, fly, duration, easing, @tsazor/runtime/easing, reversible
focus: App.tsazor
gate: check input; wait 600; look
---

Make the paragraph fly in from below, slowly — `fly` with parameters:

```tsazor
@import { fly } from "@tsazor/runtime/transition"
```

```tsazor
<p @transition="fly({ y: 200, duration: 2000 })">Flies in and out</p>
```

Built-ins work bare (`@transition="fly"`) or called with parameters, a typed TypeScript object.
Toggle quickly: a `@transition` is **reversible**, it turns around mid-flight. Easing functions
(`cubicOut`, `elasticOut`, …) come from `@tsazor/runtime/easing`.

> **Coming from Blazor:** a directive attribute has one value in Razor too; the parameters are
> passed by calling the transition, like a method group with arguments.
