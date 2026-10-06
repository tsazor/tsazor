---
title: Adding parameters
keywords: transition parameters, fly, duration, easing, @tsazor/runtime/easing, reversible
focus: App.tsazor
gate: check input; wait 600; look
---

The fade works, but it's subtle. Let the paragraph fly in from below — slowly. Swap `fade` for
`fly` and give it parameters:

```tsazor
@import { fly } from "@tsazor/runtime/transition"
```

```tsazor
<p @transition="fly({ y: 200, duration: 2000 })">Flies in and out</p>
```

Every built-in works both ways: bare, `@transition="fly"`, with its defaults — or called with
parameters. `y` is where the paragraph starts (200 pixels further down), `duration` how long it
takes, in milliseconds.

Now toggle the box quickly, while the paragraph is still on its way. It turns around and flies
back from where it is: a `@transition` is **reversible**.

`easing` changes the rhythm. `@tsazor/runtime/easing` has a whole set — `cubicOut`, `backOut`,
`elasticOut`, `bounceOut` and more. Try `fly({ y: 200, duration: 2000, easing: elasticOut })`
after importing `elasticOut`.

> **Tsazor chooses a call for the parameters.** A directive has one value, and the call is plain
> TypeScript: the editor completes `fly`'s parameters and the check finds a typo in them.
