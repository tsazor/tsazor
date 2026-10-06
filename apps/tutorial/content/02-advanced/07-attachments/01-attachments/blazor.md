---
title: Attachments
keywords: @attach, @attach:, Attachment, attachments, autofocus, tooltip, cleanup
focus: App.tsazor
gate: click .open
---

Open the search: you have to click into the box before you can type. Make it focus itself with
an **attachment** — a function that gets the element once it is in the DOM:

```tsazor
<input placeholder="Search the docs" @attach="autofocus" ... />
```

```ts
autofocus = (input: HTMLInputElement) => input.focus();
```

An attachment may return a cleanup function, which runs when the element is removed. Give the
close button a tooltip that removes itself and its listeners when the search closes:

```tsazor
<button class="close" @onclick="close" @attach="closeTip">✕</button>
```

```ts
closeTip = this.tooltip("Close the search");

tooltip(text: string) {
    return (element: HTMLElement) => {
        const tip = document.createElement("div");
        tip.className = "tooltip";
        tip.textContent = text;
        const show = () => {
            const box = element.getBoundingClientRect();
            tip.style.left = `${box.left}px`;
            tip.style.top = `${box.bottom + 6}px`;
            document.body.append(tip);
        };
        const hide = () => tip.remove();
        element.addEventListener("mouseenter", show);
        element.addEventListener("mouseleave", hide);
        return () => {
            hide();
            element.removeEventListener("mouseenter", show);
            element.removeEventListener("mouseleave", hide);
        };
    };
}
```

Attachments are compared by identity: `@attach="tooltip('Close the search')"` would build a new
function every render and re-attach every render, so the attachment lives in a field. Several per
element: `@attach` plus named ones, `@attach:shortcut="…"`. The type is `Attachment<E>`;
`tsazor check` checks it against the tag.

> **Coming from Blazor:** Blazor has no counterpart. There you'd take an `ElementReference` with
> `@ref`, call JS interop in `OnAfterRenderAsync(firstRender)` and undo it in
> `IAsyncDisposable.DisposeAsync` — and track yourself whether an element inside an `@if` is
> still there. That pattern works in Tsazor too; `@attach` ties the cleanup to the element
> instead of the component.
