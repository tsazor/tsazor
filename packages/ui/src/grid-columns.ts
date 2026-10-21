/**
 * The DataGrid column's pointer interactions (design-extended-library.md §2.1):
 * resizing a column and dragging it to another place. This module knows
 * pointers, not tables: it turns a `pointerdown` on a handle into a
 * document-tracked drag and reports what happens; the skin commits it into the
 * `DataGridModel` (whose width, display order are one state). The keyboard way
 * is the handle's own arrow keys, wired in the skin's markup (WAI-ARIA's
 * APG data-grid pattern).
 *
 * Each function's cleanup removes the document listeners; the component calls
 * it when the handle's element goes away (its dispose signal).
 */

import { isRightToLeft } from "./direction.js";

/** Options of `startColumnResize`. */
export interface ColumnResizeOptions {
  /** The drag's starting pointer (the handle's `pointerdown`). */
  pointer: PointerEvent;
  /** The width the column starts at, in px (the header's measured width). */
  initialWidth: number;
  /** The narrowest width, in px (default 40). */
  min?: number;
  /** Called live while the pointer moves, with the width in px. */
  onResize: (width: number) => void;
  /** Called once when the drag ends or runs into a cancel, with the width in px. */
  onDone?: (width: number) => void;
}

/**
 * Starts a column resize on a handle's `pointerdown`: tracks the pointer over
 * the document until it lifts (or cancel), calling `onResize` live and `onDone`
 * once at the end. A second drag on the same element supersedes the running
 * one's listeners; the returned clean-up removes them early.
 */
export function startColumnResize(options: ColumnResizeOptions): () => void {
  const fromX = options.pointer.clientX;
  // Right to left: the handle sits at the column's left edge, so moving left widens it.
  const rtl = options.pointer.target instanceof Element && isRightToLeft(options.pointer.target);
  const from = Math.max(options.min ?? 40, Math.round(options.initialWidth));
  let width = from;
  const move = (event: PointerEvent): void => {
    width = Math.max(options.min ?? 40, Math.round(from + (rtl ? fromX - event.clientX : event.clientX - fromX)));
    options.onResize(width);
  };
  const finish = (event: PointerEvent): void => {
    cleanup();
    if (event.type !== "pointercancel") options.onDone?.(width);
  };
  const cleanup = (): void => {
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", finish, true);
    document.removeEventListener("pointercancel", finish, true);
  };
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", finish, true);
  document.addEventListener("pointercancel", finish, true);
  return cleanup;
}

/** Options of `startColumnReorder`. */
export interface ColumnReorderOptions {
  /** The drag's starting pointer (the grip's `pointerdown`). */
  pointer: PointerEvent;
  /** The `thead`: the `th` cells in it are the columns in display order. */
  head: HTMLElement;
  /** The dragged column's index in the head (the grip's column). */
  fromIndex: number;
  /**
   * Marks the header the pointer is over while dragging (an attribute set on
   * the th; the skin's CSS styles it, and defaults to `data-tz-grid-target`).
   */
  markTarget?: string;
  /** Called once when the drag ends or is canceled, with the move; equal indexes mean none. */
  onDone: (fromIndex: number, toIndex: number) => void;
}

/**
 * Starts a column reorder on a grip's `pointerdown`: tracks the pointer over
 * the `head`'s `th` cells, marks the one under the pointer and reports the
 * final move (or none when the pointer stayed on the column or left the head).
 */
export function startColumnReorder(options: ColumnReorderOptions): () => void {
  const mark = options.markTarget ?? "data-tz-grid-target";
  const headers = (): HTMLElement[] => [...options.head.querySelectorAll<HTMLElement>(":scope > tr > th")];
  let marked: HTMLElement | undefined;
  const clearMark = (): void => {
    marked?.removeAttribute(mark);
    marked = undefined;
  };
  const targetOf = (event: PointerEvent): number | undefined => {
    const target = event.target as Node | null;
    if (target === null) return undefined;
    const index = headers().findIndex((header) => header === target || header.contains(target));
    return index === -1 ? undefined : index;
  };
  const move = (event: PointerEvent): void => {
    const index = targetOf(event);
    if (index === undefined) return clearMark();
    const header = headers()[index]!;
    if (marked !== header) {
      clearMark();
      marked = header;
      header.setAttribute(mark, "");
    }
  };
  const finish = (event: PointerEvent): void => {
    cleanup();
    const toIndex = event.type === "pointercancel" ? undefined : targetOf(event);
    clearMark();
    options.onDone(options.fromIndex, toIndex ?? options.fromIndex);
  };
  const cleanup = (): void => {
    clearMark();
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", finish, true);
    document.removeEventListener("pointercancel", finish, true);
  };
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", finish, true);
  document.addEventListener("pointercancel", finish, true);
  return cleanup;
}