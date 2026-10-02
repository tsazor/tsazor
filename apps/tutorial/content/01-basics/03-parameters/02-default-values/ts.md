---
title: Default values
focus: Nested.tsazor
---

The second `<Nested />` doesn't pass an answer, so it renders "The answer is" and nothing
else: the parameter is `undefined`.

A default value is just a field initializer:

```ts
@Parameter() answer = "a mystery";
```

The initializer runs when the component is created; a value the parent passes replaces it
afterwards. The first `Nested` still says 42, the second one now has an answer too.

Without a type annotation, TypeScript infers the parameter's type from the initializer —
`string` here — and Tsazor reads the attribute the same way: `answer="42"` now passes the
text `"42"`. An explicit annotation works the same way — `@Parameter() answer: string =
"a mystery";` — and is the way to go when the default alone doesn't say enough, as in
`@Parameter() items: string[] = [];`.

One thing to keep in mind: a default only applies while the parent has never set the
parameter. If a parent first passes `answer="42"` and in a later render leaves the attribute
off, the field keeps `"42"` — nothing resets it.
