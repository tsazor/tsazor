---
title: Element references
keywords: @ref, element references, focus, dialog
focus: App.tsazor
gate: click .danger
---

`@ref` on an element, like in Blazor — with one big difference: what you get is the DOM
element itself. Open the dialog as a modal:

```tsazor
<dialog class="confirm" @ref="dialog">
```

```ts
dialog?: HTMLDialogElement;

ask() {
    this.dialog?.showModal();
}
```

and close it in `cancel` and `confirm` with `this.dialog?.close()`. As in Blazor, the reference
is assigned when the element is rendered: `undefined` in `onInitialized`, available in
`onAfterRender` (focus on first render goes there).

> **Coming from Blazor:** no `ElementReference`, no `IJSRuntime`. In Blazor you'd write a
> `showDialog(el) => el.showModal()` JS function and call it through
> `JS.InvokeVoidAsync("showDialog", dialogRef)`; here the component runs in the browser, so you
> call the DOM API directly — typed by `lib.dom.d.ts`, and `tsazor check` checks the field's
> type against the tag (`HTMLInputElement` on a `<dialog>` is an error). `FocusAsync()` is
> `focus()`.

> **Tsazor extension — `disposeSignal`:** listeners you add by hand need removing, which in
> Blazor means a `DotNetObjectReference` and an `IAsyncDisposable`. Here
> `window.addEventListener("keydown", this.onKey, { signal: this.disposeSignal })` is enough:
> the signal aborts when the component is disposed (before `dispose()` runs).
