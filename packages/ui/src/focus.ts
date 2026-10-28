/** Elements that can take keyboard focus (and aren't disabled or hidden from it). */
const FOCUSABLE = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable=false])",
  "[tabindex]",
].join(",");

/**
 * The keyboard-focusable elements inside `container`, in tab order (DOM
 * order; positive tabindex is not reordered — avoid it). Elements with
 * `tabindex="-1"`, inside `inert`, hidden by `hidden` or by CSS (`display: none`, `visibility: hidden`) are left out —
 * a focus trap whose last stop is a hidden button would let Tab out.
 */
export function focusableElements(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) =>
      element.tabIndex >= 0 && element.getAttribute("tabindex") !== "-1" && !element.closest("[inert],[hidden]") && isRendered(element),
  );
}

/** Not hidden by CSS. A detached element counts as rendered: there is no style to ask. */
function isRendered(element: HTMLElement): boolean {
  if (!element.isConnected || typeof element.checkVisibility !== "function") return true;
  return element.checkVisibility({ visibilityProperty: true });
}

/** Focuses `element` without scrolling the page, when it can take focus. */
export function focusElement(element: HTMLElement | null | undefined): boolean {
  if (!element || !element.isConnected) return false;
  element.focus({ preventScroll: true });
  return element.ownerDocument.activeElement === element;
}

/**
 * Keeps the focus off the body when the part of `container` that holds it is about to go (a toast closed, a row
 * removed): before `leaving` is removed, the focus moves to the next focusable element of `container` outside it, else
 * the previous one, else `fallback` (where it came from). Does nothing when the focus isn't in `leaving`.
 */
export function moveFocusBeforeRemoval(leaving: Element, container: ParentNode, fallback?: HTMLElement | null): void {
  const active = leaving.ownerDocument.activeElement;
  if (!active || !leaving.contains(active)) return;
  const others = focusableElements(container).filter((element) => !leaving.contains(element));
  const after = others.find((element) => leaving.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
  if (focusElement(after ?? others.at(-1))) return;
  focusElement(fallback);
}
