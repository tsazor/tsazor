---
title: Toasts and dialogs
keywords: Dialog, Toaster, ToastRegion, toast, inject, service, ISnackbar
focus: App.tsazor
gate: click [data-action=delete]; click [data-action=confirm]
---

The `Dialog` handles focus, Tab and Escape. Replace the status line after deleting with a toast:
register the service in `Program.ts` —

```ts
import { Toaster } from "@tsazor/bootstrap";
```

```ts
services.registerType(Toaster, { lifetime: "singleton" });
```

— place `<ToastRegion />` once, inject it with `@import { Toaster } from "@tsazor/bootstrap"` and
`@inject Toaster toaster`, and call
`this.toaster.show({ title: "Deleted", message: "Order 101 is gone.", intent: "success" })`.

> **Coming from Blazor:** `Toaster` is MudBlazor's `ISnackbar` / Radzen's `NotificationService`;
> `registerType(…, { lifetime: "singleton" })` is `AddSingleton`. The `Dialog` stays declarative
> (`IsOpen` + `OnClosed`) rather than an `IDialogService` — the parent owns whether it's open.
