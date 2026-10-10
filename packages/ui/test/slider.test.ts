import { describe, expect, it } from "vitest";
import { sliderFraction, sliderTicks } from "../src/slider.js";

describe("sliderFraction", () => {
  it("is where the value sits between min and max, clamped", () => {
    expect(sliderFraction(25, 0, 100)).toBe(0.25);
    expect(sliderFraction(-5, 0, 100)).toBe(0);
    expect(sliderFraction(150, 0, 100)).toBe(1);
    expect(sliderFraction(15, 10, 20)).toBe(0.5);
  });

  it("is 0 for an empty range or no number", () => {
    expect(sliderFraction(5, 10, 10)).toBe(0);
    expect(sliderFraction(Number.NaN, 0, 10)).toBe(0);
  });
});

describe("sliderTicks", () => {
  it("one per step from min to max", () => {
    expect(sliderTicks(0, 100, 25)).toEqual([0, 25, 50, 75, 100]);
    expect(sliderTicks(1, 5, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it("rounds to the step's decimals", () => {
    expect(sliderTicks(0, 0.5, 0.1)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it("stops at the last step within max", () => {
    expect(sliderTicks(0, 10, 3)).toEqual([0, 3, 6, 9]);
  });

  it("is empty when there would be too many, or none make sense", () => {
    expect(sliderTicks(0, 100_000, 1)).toEqual([]);
    expect(sliderTicks(0, 10, 0)).toEqual([]);
    expect(sliderTicks(10, 0, 1)).toEqual([]);
  });
});
