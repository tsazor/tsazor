import type { Attachment } from "@tsazor/runtime";
import { focusableElements, focusElement } from "../focus.js";
import { isTopLayer, openLayer, type Layer } from "../layers.js";

/** Options of `focusTrap`. */
export interface FocusTrapOptions {
  /**
   * The overlay this belongs to (`createLayer()`): a dialog's focus trap and its dismiss handling
   * share one, so they count as one layer. Default: a layer of its own.
   */
  layer?: Layer;
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
  // Watch presses from now on — before the click that opens the dialog.
  if (typeof document !== "undefined") trackPresses(document);
  return (element) => {
    const document = element.ownerDocument;
    const previous = invokerOf(document);
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

/**
 * The element focus returns to: the focused one, or — when nothing is
 * focused — the focusable element pressed within the last second. Safari
 * doesn't focus a button on click, so a dialog opened with the mouse would
 * otherwise have nowhere to return to. (The overlay behavior uses it too.)
 */
export function invokerOf(document: Document): HTMLElement | null {
  trackPresses(document);
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) return active;
  const pressed = lastPress.get(document);
  return pressed && Date.now() - pressed.at < 1000 && pressed.element.isConnected ? pressed.element : null;
}

const lastPress = new WeakMap<Document, { element: HTMLElement; at: number }>();
const tracked = new WeakSet<Document>();

/** Starts remembering the last pressed focusable element of `document` (once). */
export function trackPresses(document: Document): void {
  if (tracked.has(document)) return;
  tracked.add(document);
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]") : null;
      if (target) lastPress.set(document, { element: target, at: Date.now() });
    },
    true,
  );
}
