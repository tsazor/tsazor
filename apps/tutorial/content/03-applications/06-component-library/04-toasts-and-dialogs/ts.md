---
title: Toasts and dialogs
keywords: Dialog, Toaster, ToastRegion, toast, inject, service
focus: App.tsazor
gate: click [data-action=delete]; click [data-action=confirm]
---

Click "Delete order": a `Dialog` asks first. Try the keyboard — focus is in the dialog, Tab stays
inside, Escape closes it and focus goes back to the button. That's the library's job, not yours.

Confirm, and the result appears as a line of text under the card. A short confirmation like this
is a job for a toast: a message in a corner that goes away by itself.

Toasts are app-wide, so they are a service. Register it in `Program.ts`:

```ts
import { Toaster } from "@tsazor/bootstrap";
```

```ts
services.registerType(Toaster, { lifetime: "singleton" });
```

Place one `<ToastRegion />` in `App.tsazor` — it shows the toasts — and inject the service:

```tsazor
@import { Toaster } from "@tsazor/bootstrap"
@inject Toaster toaster
```

Now `deleteOrder()` can say it with a toast instead of the status line:

```ts
deleteOrder() {
    this.confirming = false;
    this.toaster.show({ title: "Deleted", message: "Order 101 is gone.", intent: "success" });
}
```

Any component can inject the `Toaster` and call `show`, without a reference to the region. A toast
closes after five seconds, but waits while the pointer or focus is on it; `intent: "danger"`
toasts are announced at once.

> **Tsazor chooses a service for toasts** rather than a toast component you place per message:
> what to say belongs to the code that knows it happened, where to show it to the layout.
