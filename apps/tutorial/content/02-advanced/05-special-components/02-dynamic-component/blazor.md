---
title: Dynamic components
keywords: DynamicComponent, dynamic components, Parameters
focus: App.tsazor
---

`DynamicComponent`, ported from Blazor. `page.ts` is a list of content blocks; render each with
the component for its kind:

```tsazor
@import Heading from "./Heading.tsazor"
@import Paragraph from "./Paragraph.tsazor"
@import Quote from "./Quote.tsazor"

@foreach (const block of page) {
    <DynamicComponent Type="@blocks[block.kind]" Parameters="@block.props" />
}

@code {
    readonly blocks = { heading: Heading, text: Paragraph, quote: Quote };
}
```

Behavior is Blazor's: the same `Type` keeps the instance and passes the new parameters, a
different `Type` replaces it. Only `Type` and
`Parameters` are accepted on the tag (anything else is TZS025 at compile time); a missing `Type`
throws *DynamicComponent requires a non-null value for the parameter Type.*, an unknown key in
`Parameters` the familiar *Object of type 'Quote' does not have a property matching the name
'colour'.*

> **Coming from Blazor:** `typeof(Quote)` is just `Quote` — the class is the value — and
> `IDictionary<string, object>` is a plain object literal or `Record<string, unknown>`.
> Because `blocks` refers to the classes in code, they need an `@import`; tags alone resolve
> by file name.
