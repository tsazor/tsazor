---
title: Component references
keywords: @ref, component references
focus: App.tsazor
gate: click .toolbar button
---

A component `@ref`, as in Blazor: the field receives the instance.

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

Click the button — nothing visible happens. Blazor behaves the same: the click re-renders `App`,
`Editor`'s parameters are unchanged, so it's skipped; a public method that changes state must
call `StateHasChanged` itself. Add `this.stateHasChanged()` to `insert`.

> **Coming from Blazor:** in Razor the field type `Editor` comes from the component's
> namespace; in TypeScript a type is an import — the tag `<Editor>` resolves by file name, the
> type `Editor` in `@code` needs `@import Editor from "./Editor.tsazor"` (without it,
> `tsazor check` reports TS2304 *Cannot find name 'Editor'*). The capture runs when the child
> is created, so the field is set by the time `onAfterRender` runs.
