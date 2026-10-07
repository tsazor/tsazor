import type { Attachment } from "@tsazor/runtime";
import { focusableElements, focusElement } from "../focus.js";
import { isTopLayer, openLayer } from "../layers.js";

/** Options of `focusTrap`. */
export interface FocusTrapOptions {
  /**
   * The overlay this belongs to (`createLayer()`): a dialog's focus trap and its dismiss handling
   * share one, so they count as one layer. Default: a layer of its own.
   */
  layer?: object;
  /**
   * What gets focus when the trap starts: `"first"` (default) the first
   * focusable element, `"container"` the element itself, or a function that
   * picks one (null: the default).
   */
  initialFocus?: "first" | "container" | ((element: HTMLElement) => HTMLElement | null);
  /** Return focus to the element that had it before, when the trap ends. Default true. */
  restoreFocus?: boolean;
}

/**
 * Keeps keyboard focus inside the element while it is in the page — the
 * modal dialog pattern (WAI-ARIA APG). On attach it remembers the focused
 * element and moves focus inside; Tab and Shift+Tab wrap at the edges; when
 * the element goes away, focus returns. Nested traps: only the topmost one
 * wraps.
 *
 * ```razor
 * <div role="dialog" aria-modal="true" @attach="trap">…</div>
 *
 * @code {
 *   trap = focusTrap();
 * }
 * ```
 */
export function focusTrap(options: FocusTrapOptions = {}): Attachment<HTMLElement> {
  return (element) => {
    const document = element.ownerDocument;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layer = options.layer ?? {};
    const closeLayer = openLayer(layer);

    const initial = options.initialFocus ?? "first";
    let target: HTMLElement | null = null;
    if (typeof initial === "function") target = initial(element);
    else if (initial === "first") target = focusableElements(element)[0] ?? null;
    if (!target) {
      if (!element.hasAttribute("tabindex")) element.tabIndex = -1;
      target = element;
    }
    focusElement(target);

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== "Tab" || !isTopLayer(layer)) return;
      const focusables = focusableElements(element);
      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      const active = document.activeElement;
      const outside = !element.contains(active);
      if (event.shiftKey) {
        if (active === first || active === element || outside) {
          event.preventDefault();
          focusElement(last);
        }
      } else if (active === last || active === element || outside) {
        event.preventDefault();
        focusElement(first);
      }
    };
    document.addEventListener("keydown", onKeydown, true);

    return () => {
      document.removeEventListener("keydown", onKeydown, true);
      closeLayer();
      if (options.restoreFocus === false) return;
      // Only when focus would otherwise be lost (inside the closing element, or on the body).
      const active = document.activeElement;
      if (active === null || active === document.body || element.contains(active) || !active.isConnected) focusElement(previous);
    };
  };
}
