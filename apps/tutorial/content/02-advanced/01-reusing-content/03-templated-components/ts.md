---
title: Templated components
keywords: templated components, @typeparam, generics, context
focus: List.tsazor
typeErrors: true
---

`List.tsazor` styles a list of anything — `@typeparam TItem` makes it generic, like a
`class List<TItem>`. But it can't know how to show an item, so it prints each one as text:
`[object Object]`. The type check saw it coming: a `TItem` could be anything, and not anything
can be rendered (TS2345 in the problems panel).

The fix is a fragment that takes an argument. The list decides *where* each item goes, the
parent decides *what* it looks like:

```tsazor
<ul class="list">
    @foreach (const item of items) {
        <li>@itemTemplate?.(item)</li>
    }
</ul>

@code {
    @Parameter() items: TItem[] = [];
    @Parameter() itemTemplate?: (item: TItem) => RenderFragment;
}
```

The type says it all: give me an item, I give you a piece of UI. (Add the `@import type` for
`RenderFragment` from the last lessons.) In `App.tsazor`, fill the template for each list and
name its argument with `Context`:

```tsazor
<List items="@todos">
    <ItemTemplate Context="todo">
        <input type="checkbox" checked="@todo.done" disabled />
        @todo.title
    </ItemTemplate>
</List>
```

Do the same for the contacts — `Context="contact"`, then `@contact.name` and
`@contact.email`. Without `Context`, the argument is called `context`.

`todo` is fully typed. `TItem` is inferred from what you pass to `items`, so the template knows
it's a `{ title: string; done: boolean }`: misspell `@todo.titel` and `tsazor check` underlines
it — *Property 'titel' does not exist… Did you mean 'title'?* You can also state the type
argument yourself, as an attribute: `<List TItem="Todo" items="@todos">`.

The same works for `childContent`: declare it as `(item: TItem) => RenderFragment` and the
element content becomes the template — `<List items="@todos" Context="todo"><b>@todo.title</b></List>`.
