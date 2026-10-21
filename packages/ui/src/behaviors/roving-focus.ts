import type { Attachment } from "@tsazor/runtime";
import { isRightToLeft, logicalArrowKey } from "../direction.js";
import { focusElement } from "../focus.js";
import type { Orientation } from "../vocabulary.js";

/** Options of `rovingFocus`. */
export interface RovingFocusOptions {
  /** Selector of the items inside the element (`[role=tab]`, `[role=menuitem]`, …). */
  items: string;
  /** Which arrow keys move: left/right (`"horizontal"`, default), up/down, or `"both"`. */
  orientation?: Orientation | "both";
  /** Wrap from the last item to the first and back. Default true. */
  loop?: boolean;
  /**
   * Called with the item focus moved to, and its index — tabs select it
   * there ("automatic activation"); menus usually leave it out.
   */
  onMove?: (index: number, item: HTMLElement) => void;
  /** Move to the next item whose text starts with the typed letters. Default false (menus: true). */
  typeahead?: boolean;
}

/**
 * Arrow-key navigation in a composite widget (WAI-ARIA APG: tabs, menus,
 * toolbars, listboxes): arrows move focus between the items, Home and End
 * jump to the first and last one, disabled items are skipped. The tab stop
 * itself is the component's markup — render `tabindex="0"` on the current
 * item and `"-1"` on the others (roving tabindex).
 *
 * ```razor
 * <div role="tablist" @attach="keys">…</div>
 *
 * @code {
 *   keys = rovingFocus({ items: "[role=tab]", onMove: (index) => this.select(index) });
 * }
 * ```
 */
export function rovingFocus(options: RovingFocusOptions): Attachment<HTMLElement> {
  return (element) => {
    const orientation = options.orientation ?? "horizontal";
    const forward = orientation === "vertical" ? ["ArrowDown"] : orientation === "horizontal" ? ["ArrowRight"] : ["ArrowRight", "ArrowDown"];
    const backward = orientation === "vertical" ? ["ArrowUp"] : orientation === "horizontal" ? ["ArrowLeft"] : ["ArrowLeft", "ArrowUp"];
    let typed = "";
    let typedAt = 0;

    const onKeydown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      // Right to left: ArrowLeft goes to the next item (WAI-ARIA APG).
      const key = logicalArrowKey(event.key, orientation !== "vertical" && isRightToLeft(element));
      const items = [...element.querySelectorAll<HTMLElement>(options.items)].filter(
        (item) => !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true",
      );
      if (items.length === 0) return;
      const active = element.ownerDocument.activeElement;
      const current = items.findIndex((item) => item === active || item.contains(active));
      let next = -1;
      if (forward.includes(key)) next = current < 0 ? 0 : current + 1;
      else if (backward.includes(key)) next = current < 0 ? items.length - 1 : current - 1;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = items.length - 1;
      else if (options.typeahead && event.key.length === 1 && event.key !== " ") {
        const now = Date.now();
        typed = now - typedAt > 500 ? event.key.toLowerCase() : typed + event.key.toLowerCase();
        typedAt = now;
        // The same letter again cycles through the items starting with it (WAI-ARIA APG).
        const query = /^(.)\1*$/.test(typed) ? typed[0]! : typed;
        const start = Math.max(current, 0);
        for (let step = query.length === 1 ? 1 : 0; step <= items.length; step++) {
          const candidate = (start + step) % items.length;
          if ((items[candidate]!.textContent ?? "").trim().toLowerCase().startsWith(query)) {
            next = candidate;
            break;
          }
        }
        if (next < 0) return;
      } else return;
      if (next < 0 || next >= items.length) {
        if (options.loop === false) {
          next = Math.min(Math.max(next, 0), items.length - 1);
        } else {
          next = (next + items.length) % items.length;
        }
      }
      event.preventDefault();
      const item = items[next]!;
      focusElement(item);
      options.onMove?.(next, item);
    };
    element.addEventListener("keydown", onKeydown);
    return () => element.removeEventListener("keydown", onKeydown);
  };
}
