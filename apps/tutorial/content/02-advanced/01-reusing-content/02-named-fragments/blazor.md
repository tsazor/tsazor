---
title: Named fragments
keywords: RenderFragment, named fragments, slots
focus: Panel.tsazor
---

Several `RenderFragment` parameters, filled by child content elements — the same as in Razor.
`Panel` only has `ChildContent` so far; add a header and an optional footer:

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

And in `App.tsazor`:

```tsazor
<Panel>
    <Header>Weekly report</Header>
    <ChildContent>
        <p>Sales are up 12% on last week.</p>
    </ChildContent>
    <Footer>
        <button>Export</button>
    </Footer>
</Panel>
```

The rules are Razor's, reported as Tsazor diagnostics: loose content next to child content
elements is TZS027 (wrap it in `<ChildContent>`), a part set twice — or by an element and an
attribute — is TZS028, an unknown part name is TZS025 with a "did you mean" fix. Whether
`<Header>` is a part or a component is decided by the parent's parameters, as in Razor: inside
`<Panel>` it's the part, elsewhere it would be a `Header` component.

> **Coming from Blazor:** `if (Footer is not null)` becomes `@if (footer)` — an unset fragment
> parameter is `undefined`, and a function is always truthy.
