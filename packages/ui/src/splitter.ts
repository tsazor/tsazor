/**
 * A splitter's sizes (Fluent UI Blazor's FluentMultiSplitter), shared by both skins: pane sizes as percents of the
 * splitter, a resize of the two panes beside a bar within their min and max, and the keys of the window splitter
 * pattern (WAI-ARIA): arrows move the bar, Home and End take the pane before it to its min or max.
 */

/** A pane's length as a percent of the splitter: "30%" → 30, "240px" in a 960px splitter → 25; none for "" or junk. */
export function splitterPercent(length: string | null | undefined, splitterPixels: number): number | undefined {
  const text = (length ?? "").trim();
  const match = /^(\d+(?:\.\d+)?)\s*(%|px)?$/.exec(text);
  if (match === null) return undefined;
  const value = Number(match[1]);
  if (match[2] === "px") return splitterPixels > 0 ? (value / splitterPixels) * 100 : undefined;
  return value;
}

/**
 * The pane sizes after moving the bar between pane `bar` and pane `bar + 1` by `delta` percent: the pane before grows
 * (or shrinks) and the pane after gives (or takes) the difference, each within its min and max. `sizes` are the panes'
 * current sizes in percent (measured, so they add up to the splitter); the others keep theirs.
 */
export function resizeSplitter(
  sizes: readonly number[],
  bar: number,
  delta: number,
  mins: readonly number[],
  maxs: readonly number[],
): number[] {
  const next = [...sizes];
  const a = bar;
  const b = bar + 1;
  const before = sizes[a];
  const after = sizes[b];
  if (before === undefined || after === undefined) return next;
  const total = before + after;
  const lowest = Math.max(mins[a] ?? 0, total - (maxs[b] ?? 100));
  const highest = Math.min(maxs[a] ?? 100, total - (mins[b] ?? 0));
  const size = Math.min(Math.max(before + delta, lowest), Math.max(lowest, highest));
  next[a] = size;
  next[b] = total - size;
  return next;
}

/** How a key moves a splitter's bar: a step in percent (`Infinity` for End, `-Infinity` for Home), or none. */
export function splitterKeyDelta(key: string, orientation: "horizontal" | "vertical", shift: boolean, rtl = false): number | undefined {
  const step = shift ? 10 : 2;
  const back = orientation === "horizontal" ? (rtl ? "ArrowRight" : "ArrowLeft") : "ArrowUp";
  const forward = orientation === "horizontal" ? (rtl ? "ArrowLeft" : "ArrowRight") : "ArrowDown";
  if (key === back) return -step;
  if (key === forward) return step;
  if (key === "Home") return -Infinity;
  if (key === "End") return Infinity;
  return undefined;
}

/** What a splitter's resize hands `onResize` (FluentMultiSplitterResizeEventArgs): the pane and its new size. */
export interface SplitterResizeEventArgs {
  /** The resized pane's index (the one before the bar). */
  readonly paneIndex: number;
  /** Its new size, in percent of the splitter. */
  readonly newSize: number;
}

/** What a collapse or an expand hands `onCollapse`/`onExpand` (FluentMultiSplitterEventArgs): set `cancel` to keep it. */
export class SplitterEventArgs {
  readonly paneIndex: number;
  cancel = false;

  constructor(paneIndex: number) {
    this.paneIndex = paneIndex;
  }
}
