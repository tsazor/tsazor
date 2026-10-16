/**
 * The Scheduler's pointer interactions (design-extended-library.md §2.2): creating an
 * appointment by dragging a time range in a day's column, moving one, resizing one at its end.
 * This module knows pointers, not the schedule: it tracks the pointer, styles the preview's
 * element directly (no re-render per move) and reports the draft the skin commits into the app's
 * data. The keyboard way is the chip's own arrow keys, wired in the skin's markup.
 *
 * Every function's clean-up removes the document listeners; the component calls it when the
 * drag's element goes away (its dispose signal).
 */

import type { IsoDate } from "./calendar.js";

/** A draft the drag reports: the minutes in the day's column (the end exclusive, at least one slot). */
export interface ScheduleDragDraft {
  fromMinutes: number;
  toMinutes: number;
}

const SLOT = 15; // the drag slots to the quarter hour; so does the keyboard per keypress
const MIN_SLOTS = 1;

/** Options of `startScheduleTimeDrag`. */
export interface ScheduleTimeDragOptions {
  /** The drag's starting pointer (the column's, the chip's or the handle's `pointerdown`). */
  pointer: PointerEvent;
  /** The day's column area: its rect is the day's 0–24 h (read once, at the down). */
  column: HTMLElement;
  /** create: a new range grows beneath the pointer; move: the grabbed block shifts; resize: the block's end follows. */
  mode: "create" | "move" | "resize";
  /** The minutes the drag starts at: create — the pointer's slot; move — the block's start. */
  fromMinutes: number;
  /** The minutes the block ends at (move keeps the length; create starts at one slot). */
  toMinutes: number;
  /** Where within the block the pointer grabbed it, in minutes (0 for create and resize). */
  grabOffset?: number;
  /** The preview's element: the drag styles it live (the styles are the percentages the skin's CSS places blocks with). */
  preview?: HTMLElement;
  /** Reports the draft while the pointer moves (for a screen-reader live region or a status line). */
  onPreview?: (draft: ScheduleDragDraft) => void;
  /** Called once at the end; at a cancel the draft is the drag's start. */
  onDone: (draft: ScheduleDragDraft) => void;
}

/**
 * Starts a schedule drag on a `pointerdown`: tracks the pointer over the day's column, snaps to
 * the 15-minute slots, styles the preview (when one is given) live and reports the final draft
 * once. The returned clean-up removes the listeners early.
 */
export function startScheduleTimeDrag(options: ScheduleTimeDragOptions): () => void {
  const rect = options.column.getBoundingClientRect();
  const snap = (atY: number): number => Math.round(((atY - rect.top) / rect.height) * 1440 / SLOT) * SLOT;
  const downY = options.pointer.clientY;
  const length = options.mode === "create" ? SLOT : Math.max(MIN_SLOTS * SLOT, options.toMinutes - options.fromMinutes);
  let from = options.mode === "create" ? snap(downY) : options.fromMinutes;
  let to = options.mode === "create" ? from + length : options.toMinutes;

  const clampFrom = (value: number): number => Math.max(0, Math.min(1440 - length, value));
  const clampTo = (value: number): number => Math.max(options.mode === "resize" ? (options.fromMinutes + MIN_SLOTS * SLOT) : MIN_SLOTS * SLOT, Math.min(1440, value));

  const apply = (): void => {
    const preview = options.preview;
    if (preview === undefined) return;
    preview.style.top = `${(from / 1440) * 100}%`;
    preview.style.height = `${((to - from) / 1440) * 100}%`;
  };

  const move = (event: PointerEvent): void => {
    if (options.mode === "resize") {
      from = options.fromMinutes;
      to = clampTo(snap(event.clientY));
    } else if (options.mode === "move") {
      const at = clampFrom(snap(event.clientY) - (options.grabOffset ?? 0));
      from = at;
      to = at + length;
    } else {
      const pointerSlot = clampTo(snap(event.clientY));
      from = Math.min(snap(downY), pointerSlot);
      to = Math.max(snap(downY) + length, pointerSlot);
    }
    apply();
    options.onPreview?.({ fromMinutes: from, toMinutes: to });
  };

  const finish = (event: PointerEvent): void => {
    cleanup();
    options.onDone(event.type === "pointercancel" ? { fromMinutes: options.fromMinutes, toMinutes: options.toMinutes } : { fromMinutes: from, toMinutes: to });
  };

  const cleanup = (): void => {
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", finish, true);
    document.removeEventListener("pointercancel", finish, true);
  };
  document.addEventListener("pointermove", move, true);
  document.addEventListener("pointerup", finish, true);
  document.addEventListener("pointercancel", finish, true);
  apply();
  return cleanup;
}

/** The ISO local day-time of a day's minutes (`"2026-10-16"` + 570 → `"2026-10-16T09:30"`). */
export function isoDayTime(date: IsoDate, minutes: number): string {
  const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
  const minute = String(minutes % 60).padStart(2, "0");
  return `${date}T${hour}:${minute}`;
}