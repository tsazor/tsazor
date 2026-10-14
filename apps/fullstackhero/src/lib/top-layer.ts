/**
 * Radix renders its overlays (dialog, sheet, menu) in a Portal at the end of <body>, so no ancestor's `transform`,
 * `filter`, `backdrop-filter`, `overflow` or stacking order can move, clip or cover them — and the original's are
 * inside such ancestors: the topbar's menu and sign-out dialog sit in a `backdrop-blur` header, the dialogs center
 * with `-translate-x-1/2`. Tsazor has no portal (Blazor has none either); the browser's top layer does the same
 * job, and @tsazor/ui's `topLayer` puts an overlay there (port-fullstackhero.md, F2):
 *
 * ```razor
 * <div class="@topLayerClass" @attach="topLayer()">…</div>
 * ```
 *
 * Attach it to the overlay's outermost element, first: a parent's attachments run before its children's, so the
 * overlay is shown before a focus trap inside it moves the focus in. `raiseInTopLayer` shows the toasts above an
 * overlay that opened after them, as sonner's.
 */
export { raiseInTopLayer, topLayer } from "@tsazor/ui";

/** The frame of a full-viewport overlay (a dialog's backdrop and centering box); the library undoes the popover's own box. */
export const topLayerClass = "fixed inset-0 size-full max-h-none max-w-none";
