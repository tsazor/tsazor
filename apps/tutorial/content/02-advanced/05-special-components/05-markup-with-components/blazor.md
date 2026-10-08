---
title: Markup with components
keywords: RenderTreeBuilder, openComponent, addComponentParameter, sequence numbers
focus: markup.ts
---

Blazor's manual `RenderTreeBuilder` logic, in TypeScript. `page.ts` holds HTML from a CMS with an
`<order-button>` tag in it, and `fromHtml` in `markup.ts` builds it into a `RenderFragment` node by
node. Make the tag a component:

```ts
const component = components[node.localName];
if (component !== undefined) {
    builder.openComponent(sequence, component);
    for (const { name, value } of node.attributes) builder.addComponentParameter(0, name, value);
    builder.closeComponent();
    return;
}
```

and pass it in `App`: `fromHtml(html, { "order-button": OrderButton })`.

> **Coming from Blazor:** `RenderFragment` is a function, `(builder: RenderTreeBuilder) => void`,
> and the builder's methods are Blazor's in camelCase. There's no reflection to find a type by
> its name: the tags map to classes in a plain object. Parameter names match case-insensitively.

A tree from data takes its sequence numbers from the data: a node's place among its siblings.
Don't cut the HTML into `MarkupString`s around the tag. Static SSR streams them as one text, but
an interactive renderer parses each one alone, so an element around the component loses it.
