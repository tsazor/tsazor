import type { Attachment } from "@tsazor/runtime";

/**
 * The browser's top layer for an overlay: the element is shown as a manual popover (`popover="manual"` +
 * `showPopover()`), so it renders above the page — no ancestor's `transform`, `filter`, `backdrop-filter`,
 * `overflow` or stacking context can move, clip or cover it — while it stays where it is in the DOM: the component
 * tree, its cascading values and its events are unchanged. Radix's Portal without a portal (Blazor has none either).
 *
 * ```razor
 * <div class="fui-dialog-overlay" @attach:layer="topLayer" @attach="trap">…</div>
 * ```
 *
 * Make it the overlay root's FIRST attachment: a popover is `display: none` until it is shown, and the attachments
 * after it measure the element (`anchoredPosition`) or move the focus into it (`focusTrap`). Overlays stack in the
 * order they are shown — a menu opened in a dialog lies above it. The element gets `data-top-layer`, where a style
 * sheet of this module undoes the box the browser gives a popover (inset, size, margin, border, padding, overflow,
 * colors) at zero specificity: the component's own rules place and paint it. Without the Popover API (an old
 * engine, a DOM test environment) the element stays where its CSS puts it.
 */
export const topLayer: Attachment<HTMLElement> = (element) => {
  if (!showInTopLayer(element)) return;
  return () => hideFromTopLayer(element);
};

/**
 * Shows `element` in the top layer (see `topLayer`), for code that creates an overlay itself (a tooltip appended to
 * the body). Returns false without the Popover API.
 */
export function showInTopLayer(element: HTMLElement): boolean {
  if (typeof element.showPopover !== "function" || !element.isConnected) return false;
  adoptBoxReset(element.ownerDocument);
  if (!element.hasAttribute("popover")) element.setAttribute("popover", "manual");
  element.setAttribute("data-top-layer", "");
  if (!isOpen(element)) element.showPopover();
  shownCount++;
  return true;
}

/** Takes `element` out of the top layer again (leaving the document does too). */
export function hideFromTopLayer(element: HTMLElement): void {
  if (element.isConnected && isOpen(element)) element.hidePopover();
}

/**
 * Counts the elements shown in the top layer. The last one shown lies on top, so an element that should stay above
 * the overlays (the toasts, as Fluent UI's and sonner's lie above an open dialog) shows itself again when one
 * opened after it: `raiseInTopLayer`.
 */
let shownCount = 0;

/**
 * Shows `element` in the top layer, or — when it is there already and another element entered it since `since` (a
 * previous return value) — on top of it again. Returns the count to pass next time. Hiding and showing restarts the
 * element's CSS animations, so call it when its content changes anyway (a new toast), not on every render.
 */
export function raiseInTopLayer(element: HTMLElement, since: number): number {
  if (typeof element.showPopover !== "function" || !element.isConnected) return since;
  if (isOpen(element)) {
    if (since === shownCount) return since;
    element.hidePopover();
  }
  showInTopLayer(element);
  return shownCount;
}

function isOpen(element: HTMLElement): boolean {
  return element.matches(":popover-open");
}

/**
 * The popover's own box (the browser's: `inset: 0`, `fit-content`, `margin: auto`, a border, padding, `overflow:
 * auto`, Canvas colors) undone at zero specificity, so any rule of the component's wins. A constructed sheet, adopted
 * once per document: no `<style>` element, so a strict CSP's `style-src` has nothing to refuse.
 */
const BOX_RESET =
  ":where([data-top-layer]) { inset: auto; width: auto; height: auto; margin: 0; border: 0; padding: 0; overflow: visible; color: inherit; background-color: transparent; }";
const resetDocuments = new WeakSet<Document>();

function adoptBoxReset(document: Document): void {
  if (resetDocuments.has(document)) return;
  resetDocuments.add(document);
  if (typeof CSSStyleSheet !== "function" || !("adoptedStyleSheets" in document)) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(BOX_RESET);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}
