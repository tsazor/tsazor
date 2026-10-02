---
title: If and else
focus: App.tsazor
gate: click button
---

Markup can contain logic that plain HTML can't: conditions and loops. Click **Log in** — the
button disappears, and nothing takes its place. `@if` renders its block only while the
condition is true.

Add an `else` block for the logged-in state:

```tsazor
@if (!user.loggedIn) {
    <button @onclick="toggle">Log in</button>
} else {
    <p>Welcome back, @user.name!</p>
    <button @onclick="toggle">Log out</button>
}
```

`else if (…)` works as well, for as many branches as you need.

The condition is TypeScript, and so is the block. Inside the braces you're writing code
again — a tag starts a piece of markup that ends with its closing tag, and everything around
it is statements. You can declare a constant there and use it in the markup that follows:

```tsazor
@if (user.loggedIn) {
    const initial = user.name[0];
    <p>Your initial is @initial.</p>
}
```

Because it's real TypeScript, narrowing works the way you're used to: inside
`@if (user.email)`, the type checker knows `user.email` isn't `undefined`.
