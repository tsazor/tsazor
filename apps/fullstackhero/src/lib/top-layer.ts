import type { Attachment } from "@tsazor/runtime";

/**
 * Radix renders its overlays (dialog, sheet, menu) in a Portal at the end of <body>, so no ancestor's `transform`,
 * `filter`, `backdrop-filter`, `overflow` or stacking order can move, clip or cover them — and the original's are
 * inside such ancestors: the topbar's menu and sign-out dialog sit in a `backdrop-blur` header, the dialogs center
 * with `-translate-x-1/2`. Tsazor has no portal (Blazor has none either); the browser's top layer does the same
 * job: an element shown as a popover renders above the page, positioned against the viewport, wherever it is in the
 * DOM — which stays where it is, so the component tree, its cascading values and its events are unchanged.
 *
 * ```razor
 * <div popover="manual" class="@topLayerClass" @attach="topLayer">…</div>
 * ```
 *
 * Attach it to the overlay's outermost element: a parent's attachments run before its children's, so the overlay
 * is shown before a focus trap inside it moves the focus in. (port-fullstackhero.md, F2)
 */
export const topLayer: Attachment<HTMLElement> = (element) => {
  if (!element.hasAttribute("popover")) element.setAttribute("popover", "manual");
  element.showPopover();
  topLayerGeneration++;
  return () => {
    // Leaving the document hides it already.
    if (element.isConnected && element.matches(":popover-open")) element.hidePopover();
  };
};

/** The popover's own box undone (the browser's: centered, bordered, padded, canvas-colored): the overlay's frame. */
export const topLayerClass = "fixed inset-0 m-0 size-full max-h-none max-w-none overflow-visible border-0 bg-transparent p-0 text-inherit";

/**
 * Counts the overlays shown in the top layer. The last one shown is on top, so an element that must stay above
 * them (the toasts, above an open dialog as sonner's) shows itself again when one opened after it.
 */
export let topLayerGeneration = 0;

/** Shows `element` (a `popover="manual"` element) on top of the top layer again, if an overlay opened since `since`. */
export function raiseInTopLayer(element: HTMLElement, since: number): number {
  if (since === topLayerGeneration && element.matches(":popover-open")) return since;
  if (element.matches(":popover-open")) element.hidePopover();
  element.showPopover();
  return ++topLayerGeneration;
}
