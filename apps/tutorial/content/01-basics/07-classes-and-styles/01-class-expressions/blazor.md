---
title: Class expressions
focus: App.tsazor
gate: click button
---

The handler toggles `flipped`, the stylesheet has `.flipped` rules, but nothing sets the
class. The Razor idiom works unchanged:

```tsazor
<button class="card @(flipped ? "flipped" : null)" @onclick="flip">
```

Click the card. In a mixed attribute value, `null`/`undefined` render as empty, so the
class is `card` or `card flipped`.

For several conditional classes, a getter keeps the markup tidy:

```ts
get cardClass() {
    return ["card", this.flipped && "flipped", this.disabled && "disabled"]
        .filter(Boolean)
        .join(" ");
}
```

> **Coming from Blazor:** the conditional is TypeScript's `? :` — and the strings inside
> `@( … )` use regular double quotes even though the attribute does too, exactly as in
> Razor. If you've used a `CssBuilder`-style helper, the array-filter-join above is the
> dependency-free TypeScript equivalent.
