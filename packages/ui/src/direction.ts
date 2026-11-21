/**
 * Right to left (WAI-ARIA APG, "Keyboard Navigation in Right-to-Left"): the horizontal arrow keys follow what the
 * reader sees. In a right-to-left layout ArrowLeft goes forward — the next tab, the next month, a tree item opens, a
 * column moves to the end — and ArrowRight back.
 */

/** Whether `element` lays out right to left: its computed `direction`, which a `dir` above it sets. */
export function isRightToLeft(element: Element): boolean {
  return element.ownerDocument.defaultView?.getComputedStyle(element).direction === "rtl";
}

/** The key as a left-to-right layout means it: in right to left, ArrowLeft and ArrowRight trade places. */
export function logicalArrowKey(key: string, rtl: boolean): string {
  if (!rtl) return key;
  if (key === "ArrowLeft") return "ArrowRight";
  if (key === "ArrowRight") return "ArrowLeft";
  return key;
}
