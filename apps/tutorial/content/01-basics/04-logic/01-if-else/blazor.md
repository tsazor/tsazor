---
title: If and else
keywords: @if, else, conditional rendering
focus: App.tsazor
gate: click button
---

Razor's control blocks are unchanged. Click **Log in**: the button disappears, and there's no
`else` yet. Add it:

```tsazor
@if (!user.loggedIn) {
    <button @onclick="toggle">Log in</button>
} else {
    <p>Welcome back, @user.name!</p>
    <button @onclick="toggle">Log out</button>
}
```

As in Razor, the body of a control block is a code context: statements, with markup starting
at a tag in statement position (or at `@:` for a line of text). Only the language of those
statements changed:

```tsazor
@if (user.loggedIn) {
    const initial = user.name[0];
    <p>Your initial is @initial.</p>
}
```

> **Coming from Blazor:** conditions are TypeScript expressions, so C# patterns become their
> TS equivalents — `x is null` is `x === null` (or `x == null` for null *and* undefined),
> `x is not null` is `x !== null`. Members in the condition need no `this.`, just like in
> the markup. And nullable flow analysis has a counterpart: TypeScript narrows `user.email`
> to non-undefined inside `@if (user.email)`.
