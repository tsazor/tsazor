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
 * `tabindex="-1"`, inside `inert` or hidden by `hidden` are left out.
 */
export function focusableElements(container: ParentNode): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => element.tabIndex >= 0 && element.getAttribute("tabindex") !== "-1" && !element.closest("[inert],[hidden]"),
  );
}

/** Focuses `element` without scrolling the page, when it can take focus. */
export function focusElement(element: HTMLElement | null | undefined): boolean {
  if (!element || !element.isConnected) return false;
  element.focus({ preventScroll: true });
  return element.ownerDocument.activeElement === element;
}
