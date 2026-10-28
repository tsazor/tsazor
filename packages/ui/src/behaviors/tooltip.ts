import type { Attachment } from "@tsazor/runtime";
import { uniqueId } from "../ids.js";
import type { Placement } from "../vocabulary.js";
import { anchoredPosition } from "./anchored-position.js";
import { hideFromTopLayer, showInTopLayer } from "./top-layer.js";

/** Options of `tooltip`. */
export interface TooltipOptions {
  /** Where the tooltip sits. Default `"top"` (flips when there is no room). */
  placement?: Placement;
  /** The tooltip element's classes — the skin's look. Default `"tz-tooltip"`. */
  className?: string;
  /** When set, the text goes into an inner element with these classes (a skin's markup, e.g. Bootstrap's `tooltip-inner`). */
  innerClassName?: string;
  /** Milliseconds before a hover shows it. Default 300 (focus shows it at once). */
  delay?: number;
}

const cache = new Map<string, Attachment<HTMLElement>>();

/**
 * A tooltip on any element (WAI-ARIA tooltip pattern, WCAG 1.4.13): it
 * appears when the pointer rests on the element or the element takes focus,
 * stays while the pointer moves onto it, and goes away on Escape, blur or
 * when the pointer leaves. The element gets `aria-describedby`, so screen
 * readers read the text — in browse mode too: the tooltip stays in the DOM,
 * `hidden` while it isn't shown. The same text and options give the same attachment,
 * so `@attach="tooltip('Save')"` in markup doesn't re-attach every render.
 *
 * ```razor
 * <button @attach="tooltip('Save the order')">💾</button>
 * ```
 */
export function tooltip(text: string, options: TooltipOptions = {}): Attachment<HTMLElement> {
  const key = JSON.stringify([text, options.placement, options.className, options.innerClassName, options.delay]);
  const cached = cache.get(key);
  if (cached) return cached;
  const attachment: Attachment<HTMLElement> = (element) => attachTooltip(element, text, options);
  cache.set(key, attachment);
  return attachment;
}

function attachTooltip(element: HTMLElement, text: string, options: TooltipOptions): () => void {
  const document = element.ownerDocument;
  const id = uniqueId("tz-tooltip");
  const previousDescribedBy = element.getAttribute("aria-describedby");
  element.setAttribute("aria-describedby", previousDescribedBy ? `${previousDescribedBy} ${id}` : id);

  let shown = false;
  let detachPosition: (() => void) | void;
  let showTimer: ReturnType<typeof setTimeout> | undefined;
  let hideTimer: ReturnType<typeof setTimeout> | undefined;

  // The description lives as long as the attachment: a screen reader in browse mode reads aria-describedby
  // without focusing the element, so a tip created on focus would describe nothing there.
  const tip = document.createElement("div");
  tip.id = id;
  tip.setAttribute("role", "tooltip");
  tip.className = options.className ?? "tz-tooltip";
  tip.hidden = true;
  if (options.innerClassName) {
    const inner = document.createElement("div");
    inner.className = options.innerClassName;
    inner.textContent = text;
    tip.append(inner);
  } else {
    tip.textContent = text;
  }
  document.body.append(tip);

  const show = (): void => {
    clearTimeout(hideTimer);
    if (shown) return;
    shown = true;
    tip.hidden = false;
    // Above an open dialog or menu too: the top layer.
    showInTopLayer(tip);
    detachPosition = anchoredPosition({ anchor: () => element, placement: options.placement ?? "top", offset: 6 })(tip);
  };
  const hide = (): void => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (!shown) return;
    shown = false;
    detachPosition?.();
    hideFromTopLayer(tip);
    tip.hidden = true;
  };
  const scheduleHide = (): void => {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, 100);
  };
  const onPointerEnter = (): void => {
    clearTimeout(hideTimer);
    showTimer = setTimeout(show, options.delay ?? 300);
  };
  const onKeydown = (event: KeyboardEvent): void => {
    // Dismissable (WCAG 1.4.13): Escape closes it without moving focus.
    if (event.key === "Escape" && shown) {
      event.stopPropagation();
      hide();
    }
  };

  // Hoverable (WCAG 1.4.13): moving onto the tooltip keeps it.
  tip.addEventListener("pointerenter", () => clearTimeout(hideTimer));
  tip.addEventListener("pointerleave", scheduleHide);
  element.addEventListener("pointerenter", onPointerEnter);
  element.addEventListener("pointerleave", scheduleHide);
  element.addEventListener("focusin", show);
  element.addEventListener("focusout", hide);
  document.addEventListener("keydown", onKeydown, true);

  return () => {
    hide();
    tip.remove();
    element.removeEventListener("pointerenter", onPointerEnter);
    element.removeEventListener("pointerleave", scheduleHide);
    element.removeEventListener("focusin", show);
    element.removeEventListener("focusout", hide);
    document.removeEventListener("keydown", onKeydown, true);
    const current = (element.getAttribute("aria-describedby") ?? "").split(" ").filter((value) => value && value !== id);
    if (current.length > 0) element.setAttribute("aria-describedby", current.join(" "));
    else element.removeAttribute("aria-describedby");
  };
}
