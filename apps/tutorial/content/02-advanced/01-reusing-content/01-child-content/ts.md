---
title: Child content
focus: Card.tsazor
---

Parameters pass values into a component. Often you want to pass *markup* — the body of a card,
the contents of a dialog, the label of a button. `Card.tsazor` has a title, but its body is a
placeholder. Let it take whatever markup is written between its tags:

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

Now `App.tsazor` can fill it:

```tsazor
<Card title="Did you know?">
    <p>An octopus has <strong>three</strong> hearts.</p>
</Card>

<Card title="Shortcut">
    <p>Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save.</p>
</Card>
```

The element content of a component goes to its parameter named `childContent`. Its type,
`RenderFragment`, is a plain function — `(builder) => void` — that writes a piece of UI; the
card calls it wherever it says `@childContent`. Without that parameter the card can't take
content, and the compiler says so: *Component 'Card' does not have a parameter 'ChildContent':
it takes no element content.*

The content still belongs to `App`. It's written there, so `@name` inside it means `App`'s
`name`, its event handlers re-render `App`, and `App`'s scoped styles apply to it — the card's
`p { … }` wouldn't (that's what `::deep` is for).

**One thing to know about TypeScript.** Because child content is a function that runs later,
narrowing from an `@if` around it doesn't reach inside:

```tsazor
@if (user) {
    <Card title="Profile">
        <p>@user.name</p>   @* tsazor check: Object is possibly 'undefined'. *@
    </Card>
}
```

That's TypeScript being right: by the time the function runs, `this.user` could have changed.
Capture the value in a local first — locals keep their narrowing inside functions:

```tsazor
@if (user) {
    const current = user;
    <Card title="Profile">
        <p>@current.name</p>
    </Card>
}
```
