/** The DateRangePicker's range: the draft its calendar makes, and a typed range in order. */
import { describe, expect, it } from "vitest";
import { nextPickerDraft, orderedRange } from "../src/date-range";

describe("nextPickerDraft", () => {
  it("starts a range with one day, completes it with the second", () => {
    expect(nextPickerDraft({}, ["2026-10-05"])).toEqual({ draft: { start: "2026-10-05" }, complete: false });
    expect(nextPickerDraft({ start: "2026-10-05" }, ["2026-10-05", "2026-10-06", "2026-10-07"])).toEqual({ draft: { start: "2026-10-05", end: "2026-10-07" }, complete: true });
  });

  it("makes a one-day range of the start clicked again (the calendar clears its range then)", () => {
    expect(nextPickerDraft({ start: "2026-10-05" }, [])).toEqual({ draft: { start: "2026-10-05", end: "2026-10-05" }, complete: true });
  });

  it("clears a complete range clicked inside", () => {
    expect(nextPickerDraft({ start: "2026-10-05", end: "2026-10-07" }, [])).toEqual({ draft: {}, complete: false });
  });
});

describe("orderedRange", () => {
  it("puts the earlier date first, keeps an open end, and is null without dates", () => {
    expect(orderedRange("2026-10-09", "2026-10-02")).toEqual({ start: "2026-10-02", end: "2026-10-09" });
    expect(orderedRange("2026-10-02", undefined)).toEqual({ start: "2026-10-02" });
    expect(orderedRange(undefined, "2026-10-02")).toEqual({ end: "2026-10-02" });
    expect(orderedRange(undefined, undefined)).toBeNull();
  });
});
