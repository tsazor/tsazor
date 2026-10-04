---
title: Component references
keywords: @ref, component references
focus: App.tsazor
gate: click .toolbar button
---

`@ref` works on components too: you get the component instance, and can call its methods. The
toolbar in `App` should insert a signature into the `Editor`. The editor already has a method
for that, `insert(snippet)`. Get hold of the editor:

```tsazor
@import Editor from "./Editor.tsazor"

<Editor @ref="editor" />
```

```ts
editor?: Editor;

sign() {
    this.editor?.insert("— Ada");
}
```

The `@import` is for the *type*: the `<Editor>` tag finds its file by name, but a type in
TypeScript code comes from an import, like any other.

Click the button. The text… doesn't change, although `insert` ran and changed `text`. Nobody
re-rendered the editor: the click was an event of
`App`, so `App` re-rendered — and `Editor`, whose parameters didn't change, was skipped. A
method that others call is like a timer callback: it has to say that it changed state. In
`Editor.tsazor`:

```ts
insert(snippet: string) {
    this.text += snippet;
    this.stateHasChanged();
}
```

**Use this sparingly.** A component reference couples the parent to the child's methods, and
the child's state stops flowing from its parameters. For *what to show*, parameters and
bindings are better — `<Editor @bind-text="draft" />` would let `App` own the text. References
are for imperative actions that have no natural state: focus, scroll, reset, play.
