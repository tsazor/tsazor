---
title: Element references
keywords: @ref, element references, focus, dialog
focus: App.tsazor
gate: click .danger
---

Most of the time markup says everything: attributes, content, event handlers. But some things
only exist as methods on the DOM element — `focus()`, `scrollIntoView()`, `play()` on a
video, or `showModal()` on a `<dialog>`, which opens it as a modal with a backdrop, focus
handling and <kbd>Esc</kbd> to close. You can't write "call this method" as an attribute. You
need the element itself.

`@ref` gives it to you:

```tsazor
<dialog class="confirm" @ref="dialog">
```

```ts
dialog?: HTMLDialogElement;

ask() {
    this.dialog?.showModal();
}
```

After rendering, the field holds the real `<dialog>` element — a plain `HTMLDialogElement`, with
all its methods typed. Make `cancel` and `confirm` call `this.dialog?.close()` as well, and the
confirmation works.

The field is filled when the element is rendered, so it's still `undefined` in
`onInitialized`. Code that needs the element right away — say, to focus an input — goes into
`onAfterRender`:

```ts
override onAfterRender(firstRender: boolean) {
    if (firstRender) this.input?.focus();
}
```

**Listening yourself.** With an element (or `window`) in hand, you can also add listeners that
markup can't express — and then you have to remove them again. Pass `this.disposeSignal`, and
the listener goes away when the component does:

```ts
window.addEventListener("keydown", this.onKey, { signal: this.disposeSignal });
```

Reach for `@ref` when you need to *do* something to an element. To change what it shows, keep
using state and markup — that's what re-rendering is for.
