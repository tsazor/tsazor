---
title: Containers and views
focus: TodoItem.tsazor
refactor: true
gate: check .todo input
---

The container/presentational split you may know from Blazor component libraries: `TodoItem`
injects the store, looks up its todo by `id` and observes the store — once per item. Make it a
view that takes a `Todo` and raises an event:

```tsazor
@import type { Todo } from "./TodoStore"

<li class="todo @(todo.done ? "done" : null)">
    <label>
        <input type="checkbox" checked="@todo.done" @onchange="toggle" />
        @todo.title
    </label>
</li>

@code {
    @Parameter() todo!: Todo;
    @Parameter() onToggle?: EventCallback;

    async toggle() {
        await this.onToggle?.invokeAsync();
    }
}
```

and pass both from the container, `TodoList`:

```tsazor
<TodoItem todo="@todo" onToggle="() => store.toggle(todo.id)" @key="todo.id" />
```

Same behavior, one subscription instead of one per item. As in Blazor, an object parameter
counts as "may have changed", so every re-render of `TodoList` re-renders the items with their
todos; the `EventCallback` re-renders its owner, `TodoList`, after the toggle.

> **Coming from Blazor:** `[Parameter, EditorRequired] public Todo Todo { get; set; } = default!;`
> becomes `@Parameter() todo!: Todo;` — `!` is TypeScript's definite-assignment assertion, the
> counterpart of `= default!`. There's no `EditorRequired` check: a missing `todo` is
> `undefined` at runtime.
