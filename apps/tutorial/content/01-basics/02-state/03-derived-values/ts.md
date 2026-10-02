---
title: Derived values
focus: App.tsazor
gate: click button
---

Click the button a few times. The count goes up — but "doubled" is stuck at 2. That's
plain TypeScript at work: `doubled = this.count * 2` is a field initializer. It runs once,
when the component is created, and stores a number.

What you want is a value that's *computed from* other state. In a class, that's a getter:

```ts
get doubled() {
    return this.count * 2;
}
```

The markup doesn't change — `@doubled` reads a getter exactly like a field. And since the
template is evaluated on every render, the getter runs on every render too, so it's always
up to date.

There's no dependency tracking and no cache to invalidate: a getter is just a function that
reads the current state. That makes it the right tool for anything derived — a filtered list,
a formatted total, whether a form is complete. Keep getters cheap and free of side effects;
if something is expensive to compute, store it in a field and update that field where the
inputs change.
