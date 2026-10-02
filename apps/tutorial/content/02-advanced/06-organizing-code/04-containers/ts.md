---
title: Containers and views
focus: TodoItem.tsazor
refactor: true
gate: check .todo input
---

`TodoItem` gets an `id`, injects the store, looks its todo up, toggles it, and observes the
store to notice changes. Every single item does all of that. It works — but the item can only
ever show a todo from *that* store, each of them subscribes separately, and to understand a
checkbox you have to read about services.

Split the work in two kinds of components:

- A **container** knows where data comes from and what actions mean. `TodoList` is one: it
  injects the store and observes it.
- A **view** (or *presentational* component) gets everything through parameters and reports
  everything through events. It has no idea what a store is.

Turn `TodoItem` into a view:

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

(`!` tells TypeScript that the parent always passes `todo`.) And let the container connect it:

```tsazor
<TodoItem todo="@todo" onToggle="() => store.toggle(todo.id)" @key="todo.id" />
```

The preview behaves exactly as before. What changed is where knowledge lives: the store is
mentioned in one place, `TodoItem` is a function from a todo to markup, and it renders any todo
you give it — in another list, in a style guide, in a test, without a store in sight. When
`TodoList` re-renders, it passes the (possibly changed) todo down, so the item needs no
subscription of its own.

This is a guideline, not a law. Small apps don't need the ceremony, and a leaf that injects a
service it really owns is fine. But when templates fill up with lookups and service calls,
pushing data access up into a container and keeping the rest as views is the most reliable way
to keep components small and readable.
