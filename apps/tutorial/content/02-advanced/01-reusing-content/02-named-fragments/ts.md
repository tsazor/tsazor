---
title: Named fragments
focus: Panel.tsazor
---

One slot for content isn't always enough. `Panel` has a header and a body, and `App` would
like a footer for its button too — but everything it writes lands in the body, and the header
says "Untitled".

A component can take any number of `RenderFragment` parameters. Give `Panel` a `header` and a
`footer`:

```tsazor
<section class="panel">
    <header>@header</header>
    <div class="body">@childContent</div>
    @if (footer) {
        <footer>@footer</footer>
    }
</section>

@code {
    @Parameter() header?: RenderFragment;
    @Parameter() childContent?: RenderFragment;
    @Parameter() footer?: RenderFragment;
}
```

The `@if` leaves out the footer bar when nobody fills it — a fragment is `undefined` until a
parent passes one. Now `App` names the parts by writing elements named after the parameters:

```tsazor
<Panel>
    <Header>
        Weekly report
    </Header>
    <ChildContent>
        <p>Sales are up 12% on last week.</p>
    </ChildContent>
    <Footer>
        <button>Export</button>
    </Footer>
</Panel>
```

`<Header>` here isn't a component: directly inside `<Panel>`, a tag that names one of its
fragment parameters *is* that parameter. Once you name one part, name them all — the body goes
into `<ChildContent>`. Leave a `<p>` loose next to `<Header>` and the compiler asks you to wrap
it (TZS027), because it couldn't tell which part you meant.

Named fragments are how layouts, dialogs, tables and cards stay reusable: the component owns
the structure and the styling, the parent supplies the pieces.
