import type { Attachment } from "@tsazor/runtime";
import { focusableElements, focusElement } from "../focus.js";
import { isTopLayer, openLayer } from "../layers.js";
import { invokerOf, trackPresses } from "./focus-trap.js";
import { scrollLock } from "./scroll-lock.js";

/** What closes an overlay on a click: a click anywhere, on its content, on its background, or none (only code). */
export type OverlayCloseMode = "all" | "inside" | "outside" | "manual";

/** What the user did to an overlay: pressed Escape, or clicked its content ("inside") or its background ("outside"). */
export type OverlayPress = "escape" | "inside" | "outside";

/**
 * Whether `press` closes an overlay that closes on `mode`. Escape closes it unless the mode is manual: it is the
 * keyboard's way to do what a click does.
 */
export function overlayClosesOn(mode: OverlayCloseMode, press: OverlayPress): boolean {
  if (mode === "manual") return false;
  return press === "escape" || mode === "all" || mode === press;
}

/** An overlay's background: `color` at `opacity` percent (0–100), as Fluent UI Blazor mixes it. */
export function overlayBackground(color: string, opacity: number): string {
  const percent = Math.min(100, Math.max(0, Number.isFinite(opacity) ? opacity : 0));
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/** Options of `overlayBehavior`. */
export interface OverlayBehaviorOptions {
  /**
   * What the overlay blocks while it is in the page:
   * - `"page"` covers the viewport: everything else is inert, the page doesn't scroll, focus moves in (and back
   *   when it goes), and Escape reaches it before a dialog under it;
   * - `"region"` covers its container: the container's other content is inert, and focus that was in it moves in
   *   (and back); Escape reaches it while it has the focus;
   * - `"none"` blocks nothing (an interactive overlay): a press anywhere else on the page counts as outside.
   */
  blocks: "page" | "region" | "none";
  /** The user pressed Escape or clicked; the component decides whether that closes it (`overlayClosesOn`). */
  onPress: (press: OverlayPress) => void;
}

/**
 * The behavior of an overlay — a busy state over a region or over the page (Fluent UI Blazor's FluentOverlay,
 * MudBlazor's MudOverlay). What it covers is inert while it shows: no clicks, no focus, hidden from screen readers.
 * A click on the element itself is on the background ("outside"); a click on anything in it is on its content
 * ("inside"), so the content should be a child that takes only its own size.
 *
 * ```razor
 * <div class="overlay" @attach="behavior"><div class="overlay__content"><Spinner /></div></div>
 *
 * @code {
 *   behavior = overlayBehavior({ blocks: "region", onPress: (press) => this.pressed(press) });
 * }
 * ```
 */
export function overlayBehavior(options: OverlayBehaviorOptions): Attachment<HTMLElement> {
  // Watch presses from now on — before the click that shows the overlay (see focusTrap).
  if (typeof document !== "undefined") trackPresses(document);
  return (element) => {
    const document = element.ownerDocument;
    const { blocks } = options;
    const cleanups: Array<() => void> = [];

    // Escape: a page overlay is a layer while it shows; any other one while it has the focus, so Escape
    // elsewhere still closes the dialog around it.
    const layer = {};
    let leave: (() => void) | undefined;
    if (blocks === "page") {
      leave = openLayer(layer);
    } else {
      const enter = (): void => {
        leave ??= openLayer(layer);
      };
      const exit = (event: FocusEvent): void => {
        if (element.contains(event.relatedTarget as Node | null)) return;
        leave?.();
        leave = undefined;
      };
      element.addEventListener("focusin", enter);
      element.addEventListener("focusout", exit);
      cleanups.push(() => {
        element.removeEventListener("focusin", enter);
        element.removeEventListener("focusout", exit);
      });
    }
    const onKeydown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || leave === undefined || !isTopLayer(layer)) return;
      event.preventDefault();
      event.stopPropagation();
      options.onPress("escape");
    };
    document.addEventListener("keydown", onKeydown, true);
    cleanups.push(() => document.removeEventListener("keydown", onKeydown, true));

    const onClick = (event: MouseEvent): void => {
      const target = event.target as Node | null;
      if (target === null || !element.contains(target)) return;
      options.onPress(target === element ? "outside" : "inside");
    };
    element.addEventListener("click", onClick);
    cleanups.push(() => element.removeEventListener("click", onClick));
    if (blocks === "none") {
      // The background lets presses through to the page: one there is outside.
      const onPointerdown = (event: Event): void => {
        const target = event.target as Node | null;
        if (target !== null && !element.contains(target)) options.onPress("outside");
      };
      document.addEventListener("pointerdown", onPointerdown, true);
      cleanups.push(() => document.removeEventListener("pointerdown", onPointerdown, true));
    }

    if (blocks !== "none") {
      const scope = blocks === "page" ? document.body : element.parentElement;
      // Before the covered content goes inert: inert content loses the focus.
      const invoker = invokerOf(document);
      const covered = invoker !== null && (blocks === "page" || (scope?.contains(invoker) ?? false));
      if (scope !== null) cleanups.push(inertOutside(element, scope));
      if (blocks === "page") {
        const unlock = scrollLock()(element);
        if (typeof unlock === "function") cleanups.push(unlock);
      }
      if (blocks === "page" || covered) {
        const target = focusableElements(element)[0] ?? element;
        if (target === element && !element.hasAttribute("tabindex")) element.tabIndex = -1;
        focusElement(target);
        if (blocks !== "page") leave ??= openLayer(layer);
        // After the content is no longer inert (cleanups run in order): focus returns to where it was, unless the
        // user has moved it on.
        cleanups.push(() => {
          const active = document.activeElement;
          if (active === null || active === document.body || element.contains(active) || !active.isConnected) focusElement(covered ? invoker : null);
        });
      }
    }

    return () => {
      leave?.();
      leave = undefined;
      for (const cleanup of cleanups) cleanup();
    };
  };
}

/** Shown in the top layer (`showInTopLayer`). */
function inTopLayer(element: Element): boolean {
  if (!element.hasAttribute("data-top-layer")) return false;
  try {
    return element.matches(":popover-open");
  } catch {
    return false; // an engine without the Popover API: nothing is in the top layer
  }
}

/**
 * Makes everything inside `scope` inert except `element` and its ancestors, and what is shown in the top layer — on each level from the element up to
 * the scope, the siblings — and children added to those levels meanwhile. Returns the function that undoes what it
 * did (and only that: what was inert before stays inert).
 */
function inertOutside(element: HTMLElement, scope: HTMLElement): () => void {
  const made = new Set<Element>();
  const observers: MutationObserver[] = [];
  const inertSiblings = (parent: Element, keep: Element): void => {
    for (const child of parent.children) {
      if (child === keep || child.hasAttribute("inert") || child instanceof HTMLScriptElement || child instanceof HTMLStyleElement) continue;
      // In the top layer it lies above the overlay, not under it: a ToastRegion's toasts stay announced and pressable.
      if (inTopLayer(child)) continue;
      child.setAttribute("inert", "");
      made.add(child);
    }
  };
  let node: Element = element;
  while (node !== scope && node.parentElement !== null) {
    const parent = node.parentElement;
    const keep = node;
    inertSiblings(parent, keep);
    const observer = new MutationObserver(() => inertSiblings(parent, keep));
    observer.observe(parent, { childList: true });
    observers.push(observer);
    node = parent;
  }
  return () => {
    for (const observer of observers) observer.disconnect();
    for (const child of made) child.removeAttribute("inert");
  };
}
