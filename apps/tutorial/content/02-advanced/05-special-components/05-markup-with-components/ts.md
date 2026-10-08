---
title: Markup with components
keywords: RenderTreeBuilder, openComponent, addComponentParameter, sequence numbers
focus: markup.ts
---

`page.ts` is a page as your CMS stores it: HTML an editor wrote, with an `<order-button>` tag
where the shop's order button belongs. `App` shows the text, but the tag stays an empty element.
Make it the `OrderButton` component.

`fromHtml` in `markup.ts` turns the HTML into a `RenderFragment`: a function that writes UI into
a builder, with the calls the compiler writes for your markup (`openElement`, `addAttribute`,
`addContent`). Write a component the same way where a tag names one:

```ts
const component = components[node.localName];
if (component !== undefined) {
    builder.openComponent(sequence, component);
    for (const { name, value } of node.attributes) builder.addComponentParameter(0, name, value);
    builder.closeComponent();
    return;
}
```

Then pass the tag's component in `App`: `fromHtml(html, { "order-button": OrderButton })`. The
button counts your clicks: it's a live component.

The compiler numbers the frames by their place in your source. A tree from data numbers them by
their place among their siblings, so the same HTML keeps its components when it renders again.

Why not cut the HTML into `MarkupString`s around the tag? The browser parses each one alone, so
the `<div>` that opens before the button and closes after it would end up empty. And as with
`MarkupString`, only build HTML you trust.
