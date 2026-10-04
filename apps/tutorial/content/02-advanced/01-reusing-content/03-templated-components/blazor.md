---
title: Templated components
keywords: templated components, @typeparam, generics, context
focus: List.tsazor
typeErrors: true
---

A generic list with an item template — Blazor's `RenderFragment<TItem>`. `List.tsazor` is
generic already (`@typeparam TItem`) but prints items as text: `[object Object]`, where C#
would print the type name. `tsazor check` flags it, too — markup renders strings, numbers,
booleans, fragments and `MarkupString`, and an unconstrained `TItem` is none of them (TS2345).
Add the template:

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

and fill it in `App.tsazor` for both lists:

```tsazor
<List items="@todos">
    <ItemTemplate Context="todo">
        <input type="checkbox" checked="@todo.done" disabled />
        @todo.title
    </ItemTemplate>
</List>
```

`Context` works as in Razor: on the part, or on the component for all of its parts; the
default name is `context`; nested templates with the same name are TZS029 (*use
`Context="another_name"`*). Type argument attributes (`TItem="Todo"`) are accepted, but
usually unnecessary: `tsazor check` infers `TItem` from `items` and types `todo` accordingly
(`@todo.titel` is TS2551).

> **Coming from Blazor:** `RenderFragment<TItem>` is spelled as what it is in TypeScript, a
> function from the item to a fragment: `(item: TItem) => RenderFragment`. Calling it is
> `@itemTemplate(item)` — the same as `@ItemTemplate(item)` in Razor. Generic constraints use
> TypeScript syntax: `@typeparam TItem extends { id: string }` (a C# `where` clause is TZS021).
