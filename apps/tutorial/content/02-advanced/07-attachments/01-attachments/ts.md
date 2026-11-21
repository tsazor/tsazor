---
title: Attachments
keywords: @attach, @attach:, Attachment, attachments, autofocus, tooltip, cleanup
focus: App.tsazor
gate: click .open
---

Open the search. You have to click into the box before you can type — annoying. The box should
focus itself the moment it appears.

That's a job for an **attachment**: a function that gets the element once it is in the page.
Add one to the input:

```tsazor
<input placeholder="Search the docs" @attach="autofocus" ... />
```

```ts
autofocus = (input: HTMLInputElement) => input.focus();
```

Open the search again: the cursor is already in the box. Every time the `@if` brings the input
back, it's a new element, and the attachment runs again.

**Cleaning up.** An attachment may return a function. That one runs when the element goes away
— here when you close the search. That makes attachments the place for behavior that has to be
undone, like a tooltip with its own listeners. Give the close button one:

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

Hover the ✕, then click it: the button disappears, and its tooltip and listeners go with it.

**Why a field?** You could write `@attach="tooltip('Close the search')"` right in the markup. It
works, but the call makes a new function on every render, and a different function means
"detach the old one, attach the new one". Tsazor compares attachments by identity, so keep the
attachment in a field (or have the factory remember what it returned) and it stays attached
across renders.

An element can have several attachments: one `@attach` plus any number of named ones,
`@attach:shortcut="…"`, each with its own cleanup. Their type is `Attachment<E>` from
`@tsazor/runtime` — on an `<input>` the parameter is an `HTMLInputElement`, and `tsazor check`
reports an attachment meant for another element.

> **Plain DOM code works too.** `@ref` plus `onAfterRender`, and removing the listeners in
> `dispose`, does the same job. Tsazor adds attachments because there the cleanup is tied to the
> element's lifetime: an element inside an `@if` or a `@foreach` row comes and goes many times
> while the component lives on, and an attachment follows each one.
