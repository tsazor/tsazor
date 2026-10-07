import type { Attachment } from "@tsazor/runtime";
import type { Placement } from "../vocabulary.js";

/** Options of `anchoredPosition`. */
export interface AnchoredPositionOptions {
  /** The element to sit next to (a toggle button, an input). */
  anchor: () => Element | null | undefined;
  /** Preferred place. Default `"bottom-start"`. */
  placement?: Placement;
  /** Gap between anchor and element, in pixels. Default 4. */
  offset?: number;
  /** Switch to the opposite side when the preferred one has no room. Default true. */
  flip?: boolean;
  /** Keep this distance from the viewport edges, in pixels. Default 8. */
  padding?: number;
  /** Make the element at least as wide as the anchor (selects, comboboxes). Default false. */
  matchWidth?: boolean;
}

type Side = "top" | "bottom" | "left" | "right";
type Align = "start" | "center" | "end";

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };

/** The element's box at `placement` next to the anchor box. */
export function computePosition(
  anchor: DOMRectReadOnly,
  floating: { width: number; height: number },
  placement: Placement,
  offset: number,
): { left: number; top: number } {
  const [side, align = "center"] = placement.split("-") as [Side, Align?];
  let left: number;
  let top: number;
  if (side === "top" || side === "bottom") {
    top = side === "top" ? anchor.top - floating.height - offset : anchor.bottom + offset;
    left = align === "start" ? anchor.left : align === "end" ? anchor.right - floating.width : anchor.left + (anchor.width - floating.width) / 2;
  } else {
    left = side === "left" ? anchor.left - floating.width - offset : anchor.right + offset;
    top = align === "start" ? anchor.top : align === "end" ? anchor.bottom - floating.height : anchor.top + (anchor.height - floating.height) / 2;
  }
  return { left, top };
}

/**
 * Positions a floating element (menu, popover, tooltip, select list) next
 * to its anchor with `position: fixed`: at the preferred placement, flipped
 * to the other side when there is no room, and shifted to stay inside the
 * viewport. It follows scrolling and resizing while it is in the page. The
 * final placement is written to `data-placement`, for arrows and
 * transitions. No dependencies (no Popper, no Floating UI).
 *
 * ```razor
 * <ul role="menu" @attach="position">…</ul>
 *
 * @code {
 *   position = anchoredPosition({ anchor: () => this.toggle, placement: "bottom-start" });
 * }
 * ```
 */
export function anchoredPosition(options: AnchoredPositionOptions): Attachment<HTMLElement> {
  return (element) => {
    const window = element.ownerDocument.defaultView;
    if (!window) return;
    const offset = options.offset ?? 4;
    const padding = options.padding ?? 8;
    const preferred = options.placement ?? "bottom-start";
    element.style.position = "fixed";
    element.style.margin = "0";

    const update = (): void => {
      const anchorElement = options.anchor();
      if (!anchorElement || !anchorElement.isConnected) return;
      const anchor = anchorElement.getBoundingClientRect();
      if (options.matchWidth) element.style.minWidth = `${anchor.width}px`;
      const size = { width: element.offsetWidth, height: element.offsetHeight };
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      let placement = preferred;
      let position = computePosition(anchor, size, placement, offset);
      if (options.flip !== false && overflows(position, size, viewport, padding, side(placement))) {
        const flipped = flip(placement);
        const alternative = computePosition(anchor, size, flipped, offset);
        if (!overflows(alternative, size, viewport, padding, side(flipped))) {
          placement = flipped;
          position = alternative;
        }
      }
      // Shift along the edge so the element stays in the viewport.
      const left = clamp(position.left, padding, viewport.width - size.width - padding);
      const top = clamp(position.top, padding, viewport.height - size.height - padding);
      element.style.left = `${Math.round(left)}px`;
      element.style.top = `${Math.round(top)}px`;
      element.setAttribute("data-placement", placement);
    };

    let frame = 0;
    const schedule = (): void => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    update();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    const observer = typeof window.ResizeObserver === "function" ? new window.ResizeObserver(schedule) : null;
    observer?.observe(element);
    const anchorElement = options.anchor();
    if (anchorElement) observer?.observe(anchorElement);

    return () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  };
}

function side(placement: Placement): Side {
  return placement.split("-")[0] as Side;
}

function flip(placement: Placement): Placement {
  const [s, align] = placement.split("-") as [Side, string?];
  return (align ? `${OPPOSITE[s]}-${align}` : OPPOSITE[s]) as Placement;
}

/** Whether the box leaves the viewport on its own side. */
function overflows(position: { left: number; top: number }, size: { width: number; height: number }, viewport: { width: number; height: number }, padding: number, s: Side): boolean {
  switch (s) {
    case "top":
      return position.top < padding;
    case "bottom":
      return position.top + size.height > viewport.height - padding;
    case "left":
      return position.left < padding;
    case "right":
      return position.left + size.width > viewport.width - padding;
  }
}

function clamp(value: number, min: number, max: number): number {
  return max < min ? min : Math.min(Math.max(value, min), max);
}
