---
title: Names and types
keywords: CascadingValue, named cascades, @CascadingParameter
focus: Greeting.tsazor
---

Two cascades now: a theme and a language. But `Greeting` says *theme: de, language: de* — both
of its cascading parameters got the language.

An unnamed `@CascadingParameter()` takes the value of the nearest unnamed `<CascadingValue>`
above it, whatever that value is. With one cascade that's exactly what you want; with two,
the inner one wins for both. Give them names:

```tsazor
<CascadingValue Value="@theme" Name="theme">
    <CascadingValue Value="@language" Name="language">
        <Greeting />
    </CascadingValue>
</CascadingValue>
```

```ts
@CascadingParameter({ name: "theme" }) theme = "light";
@CascadingParameter({ name: "language" }) language = "en";
```

A named parameter only matches a cascade of the same name (case doesn't matter), and an unnamed
one never matches a named cascade — so names are the safe default for strings, numbers and
other plain values.

**Matching by type.** For an object of a class you can match on the class instead:

```ts
@CascadingParameter({ type: Session }) session?: Session;
```

finds the nearest unnamed cascade whose value is a `Session` (an `instanceof` check — a
subclass counts too). TypeScript's types disappear when the code runs, so the class is passed
as a value. Data from an API is a plain object, never an instance of its model class, so
cascade it by name; in development, Tsazor warns when a by-type parameter passes one. The forms chapter uses exactly this: every input finds its form's `EditContext` with
`@CascadingParameter({ type: EditContext })`.
