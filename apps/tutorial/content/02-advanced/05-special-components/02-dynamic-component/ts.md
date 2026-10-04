---
title: Dynamic components
keywords: DynamicComponent, dynamic components, Parameters
focus: App.tsazor
---

Sometimes the data decides which component to show. `page.ts` describes a page the way a
content system would store it: a list of blocks, each with a `kind` and its settings. There's a
component for each kind — `Heading`, `Paragraph`, `Quote` — but `App` just dumps the raw data.

You could write an `@if` per kind. Or let the data pick the component directly, with
`DynamicComponent`:

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

A component is a class, and a class is a value: you can put it in an object, pass it around,
look it up by key. `Type` is the component to render, `Parameters` an object of parameter
values — `{ text: "…", author: "…" }` sets `text` and `author` on the `Quote`. The imports
are needed because `blocks` uses the classes in code, not as tags.

Two details:

- `Parameters` is checked when the component renders, not by the compiler: a key the component
  doesn't declare throws — *Object of type 'Quote' does not have a property matching the name
  'colour'.* The error goes to the nearest error boundary, like any rendering error.
- When `Type` stays the same, the component instance is kept and just gets new parameters. When
  it changes, the old instance is disposed and a new one created — like swapping one tag for
  another.

Adding a block type is now one entry in `blocks`. That's the pattern behind page builders,
dashboards with configurable widgets, and plugin slots.
