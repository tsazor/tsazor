---
title: Text inputs
keywords: @bind, binding, text input, two-way binding
focus: App.tsazor
gate: change input Tsazor
---

`value="@name"` is one-way: type into the box and press Enter, the heading stays the same.
Make it two-way:

```tsazor
<input @bind="name" />
```

`@bind` has Blazor's (.NET 7) semantics: a `value` attribute plus an `onchange` handler that
assigns the element's value, then the usual re-render. The update happens on `change` —
Enter or leaving the field — not on every keystroke.

> **Coming from Blazor:** the bind target is checked when compiling: it must be assignable
> in TypeScript — a field, a member path like `user.name`, an element access like
> `items[i]`. `a?.b` (optional chaining is never assignable), calls, `const` locals and loop
> variables are compile errors (TZS008) instead of runtime surprises — bind to
> `items[i].name` rather than to a `@foreach` variable.
