import { Toaster, type Intent } from "@tsazor/ui";

/**
 * sonner's `toast`, over @tsazor/ui's Toaster: the original's 84 call sites stay as they are —
 * `toast.success("Invoice generated", { description, action: { label, onClick } })`. The Toaster is the app's
 * service (main.ts registers this instance); FshToaster renders it in sonner's markup, which globals.css styles.
 */
export const toaster = new Toaster();

/** sonner's options, as far as the original uses them. */
export type ToastOptions = {
  description?: string;
  duration?: number;
  action?: { label: string; onClick: () => void };
};

/** App.tsx's Toaster: `toastOptions.duration`. */
const DURATION = 4200;

function show(intent: Intent, title: string, options: ToastOptions = {}): number {
  return toaster.show({
    title,
    message: options.description,
    intent,
    timeout: options.duration ?? DURATION,
    action: options.action,
  });
}

export const toast = Object.assign((title: string, options?: ToastOptions) => show("neutral", title, options), {
  success: (title: string, options?: ToastOptions) => show("success", title, options),
  error: (title: string, options?: ToastOptions) => show("danger", title, options),
  warning: (title: string, options?: ToastOptions) => show("warning", title, options),
  info: (title: string, options?: ToastOptions) => show("info", title, options),
  message: (title: string, options?: ToastOptions) => show("neutral", title, options),
  dismiss: (id?: number) => {
    if (id !== undefined) toaster.dismiss(id);
    else for (const entry of toaster.toasts) toaster.dismiss(entry.id);
  },
});
