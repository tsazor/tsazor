/**
 * The DateRangePicker's range (MudDateRangePicker): picked in a range calendar — a start, then an end — or typed into
 * its two fields. The calendar marks a range by its days, so one picked day can be a started range or a range of that
 * one day; the picker keeps its draft to tell them apart.
 */
import { rangeOfDates, type DateRange, type IsoDate } from "./calendar.js";

/**
 * The picker's draft after its calendar reported `dates`, and whether the range is complete (the picker closes then).
 * The start clicked again — the calendar clears its range then — makes a range of that one day.
 */
export function nextPickerDraft(draft: DateRange, dates: readonly IsoDate[]): { draft: DateRange; complete: boolean } {
  if (dates.length === 0) {
    if (draft.start !== undefined && draft.end === undefined) return { draft: { start: draft.start, end: draft.start }, complete: true };
    return { draft: {}, complete: false };
  }
  const range = rangeOfDates(dates);
  return { draft: range, complete: range.end !== undefined };
}

/** A typed range in order, the earlier date first; null when both fields are empty. */
export function orderedRange(start: IsoDate | undefined, end: IsoDate | undefined): DateRange | null {
  if (start === undefined && end === undefined) return null;
  if (start !== undefined && end !== undefined && end < start) return { start: end, end: start };
  return { ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) };
}
