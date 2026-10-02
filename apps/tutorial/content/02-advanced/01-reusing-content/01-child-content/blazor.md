---
title: Child content
focus: Card.tsazor
---

`ChildContent` works as you know it. `Card.tsazor` has a title but no body yet — give it a
`RenderFragment` parameter and render it:

```tsazor
@import type { RenderFragment } from "@tsazor/runtime"

<div class="card">
    <h2>@title</h2>
    @childContent
</div>

@code {
    @Parameter() title = "";
    @Parameter() childContent?: RenderFragment;
}
```

Then fill both cards in `App.tsazor`:

```tsazor
<Card title="Did you know?">
    <p>An octopus has <strong>three</strong> hearts.</p>
</Card>
```

As in Razor, element content goes to the parameter named `ChildContent` (matched
case-insensitively, so the TypeScript member is `childContent`). Content for a component
without one fails at compile time — TZS025, *it takes no element content* — where Blazor
throws at runtime (*does not have a property matching the name 'ChildContent'*). The content
keeps the parent's context: its members, its re-render after events, its CSS isolation scope.

> **Coming from Blazor:** `RenderFragment` is a TypeScript type, `(builder: RenderTreeBuilder)
> => void`, so it's imported like any type — `@import type { … } from "@tsazor/runtime"`, or
> once for a whole folder in `_Imports.tsazor` (chapter "Organizing code"). There's no
> `Microsoft.AspNetCore.Components` default namespace to lean on.

> **Coming from Blazor — nullability in child content:** C#'s flow analysis and TypeScript's
> narrowing differ in one visible place. Inside `@if (user) { <Card>@user.name</Card> }` the
> body of `<Card>` is a lambda, and TypeScript drops the narrowing of `this.user` in it
> (`tsazor check`: TS2532 *Object is possibly 'undefined'*) — the property could change
> before the lambda runs. Capture it first: `@if (user) { const current = user; <Card>@current.name</Card> }`,
> or read it through a getter. The same applies to every deferred fragment, `<PageTitle>`
> included.
