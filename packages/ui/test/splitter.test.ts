import { describe, expect, it } from "vitest";
import { resizeSplitter, splitterKeyDelta, splitterPercent } from "../src/index";

describe("splitterPercent", () => {
  it("reads percents and pixels as percents of the splitter", () => {
    expect(splitterPercent("30%", 900)).toBe(30);
    expect(splitterPercent("225px", 900)).toBe(25);
    expect(splitterPercent("40", 900)).toBe(40);
    expect(splitterPercent("", 900)).toBeUndefined();
    expect(splitterPercent("1fr", 900)).toBeUndefined();
  });
});

describe("resizeSplitter", () => {
  it("moves the bar: the pane before grows, the one after gives way", () => {
    expect(resizeSplitter([30, 70], 0, 10, [0, 0], [100, 100])).toEqual([40, 60]);
    expect(resizeSplitter([20, 30, 50], 1, -10, [0, 0, 0], [100, 100, 100])).toEqual([20, 20, 60]);
  });

  it("keeps both panes within their min and max", () => {
    expect(resizeSplitter([30, 70], 0, 50, [10, 40], [100, 100])).toEqual([60, 40]);
    expect(resizeSplitter([30, 70], 0, -50, [20, 0], [100, 100])).toEqual([20, 80]);
    expect(resizeSplitter([30, 70], 0, 50, [0, 0], [45, 100])).toEqual([45, 55]);
    expect(resizeSplitter([30, 70], 0, -Infinity, [10, 0], [90, 100])).toEqual([10, 90]);
  });
});

describe("splitterKeyDelta (the window splitter pattern)", () => {
  it("arrows along the orientation move by a step; Shift by more; Home and End to the ends", () => {
    expect(splitterKeyDelta("ArrowRight", "horizontal", false)).toBe(2);
    expect(splitterKeyDelta("ArrowLeft", "horizontal", true)).toBe(-10);
    expect(splitterKeyDelta("ArrowDown", "vertical", false)).toBe(2);
    expect(splitterKeyDelta("ArrowRight", "vertical", false)).toBeUndefined();
    expect(splitterKeyDelta("Home", "horizontal", false)).toBe(-Infinity);
    expect(splitterKeyDelta("ArrowRight", "horizontal", false, true)).toBe(-2);
  });
});
