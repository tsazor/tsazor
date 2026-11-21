import { describe, expect, it } from "vitest";
import { arcPath, areaPath, chartSummary, linearScale, linePath, niceStep, pieSlices, stackSeries, valueAxis } from "../src/chart-math.js";

describe("the value axis", () => {
  it("takes round steps: 1, 2, 2.5 or 5 times a power of ten", () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(17)).toBe(20);
    expect(niceStep(23)).toBe(25);
    expect(niceStep(31)).toBe(50);
    expect(niceStep(0.03)).toBeCloseTo(0.05);
  });

  it("starts at zero and ends on a round tick", () => {
    const axis = valueAxis(98, 182);
    expect(axis.min).toBe(0);
    expect(axis.max).toBe(200);
    expect(axis.ticks).toEqual([0, 50, 100, 150, 200]);
  });

  it("takes negatives in, a given step, a given min and max", () => {
    expect(valueAxis(-30, 40).ticks).toEqual([-40, -20, 0, 20, 40]);
    expect(valueAxis(0, 100, { step: 25 }).ticks).toEqual([0, 25, 50, 75, 100]);
    expect(valueAxis(150, 180, { min: 140, step: 10 }).ticks).toEqual([140, 150, 160, 170, 180]);
    expect(valueAxis(0, 0).max).toBeGreaterThan(0);
  });

  it("maps values onto pixels", () => {
    const y = linearScale([0, 200], [300, 0]);
    expect(y(0)).toBe(300);
    expect(y(100)).toBe(150);
  });
});

describe("lines and areas", () => {
  const points = [{ x: 0, y: 10 }, { x: 10, y: 0 }, { x: 20, y: 10 }];

  it("a straight line through the points", () => {
    expect(linePath(points)).toBe("M0,10 L10,0 L20,10");
    expect(linePath([])).toBe("");
  });

  it("a smooth line never goes past the values (a peak stays flat)", () => {
    const path = linePath(points, true);
    expect(path.startsWith("M0,10 C")).toBe(true);
    // The control points around the peak at y 0 stay at y 0: no overshoot.
    const ys = [...path.matchAll(/[\d.]+,(-?[\d.]+)/g)].map((match) => Number(match[1]));
    expect(Math.min(...ys)).toBe(0);
  });

  it("an area closes down to the baseline", () => {
    expect(areaPath(points, 30)).toBe("M0,10 L10,0 L20,10 L20,30 L0,30 Z");
  });
});

describe("stacks and slices", () => {
  it("stacks the series, negatives down", () => {
    expect(stackSeries([[1, 2], [3, -1]])).toEqual([
      [{ from: 0, to: 1 }, { from: 0, to: 2 }],
      [{ from: 1, to: 4 }, { from: 0, to: -1 }],
    ]);
  });

  it("cuts the circle into the values' shares from 12 o'clock", () => {
    const slices = pieSlices([1, 1, 2]);
    expect(slices.map((slice) => slice.share)).toEqual([0.25, 0.25, 0.5]);
    expect(slices[2]!.end).toBeCloseTo(2 * Math.PI);
    expect(pieSlices([0, 0]).map((slice) => slice.share)).toEqual([0, 0]);
  });

  it("draws a pie slice to the center and a donut's as a ring; a whole circle in two halves", () => {
    expect(arcPath(50, 50, 40, 0, 0, Math.PI / 2)).toBe("M50,50 L50,10 A40,40 0 0 1 90,50 Z");
    expect(arcPath(50, 50, 40, 20, 0, Math.PI / 2)).toBe("M50,10 A40,40 0 0 1 90,50 L70,50 A20,20 0 0 0 50,30 Z");
    expect(arcPath(50, 50, 40, 0, 0, 2 * Math.PI).split("M")).toHaveLength(3);
  });
});

describe("chartSummary", () => {
  const format = (value: number): string => String(value);

  it("says where each series goes, over which labels", () => {
    expect(chartSummary("line", [{ name: "Rye", data: [98, 182, 120] }, { name: "Spelt", data: [40, 40] }], ["Mon", "Tue", "Wed"], format))
      .toBe("Line chart: Rye from 98 to 182; Spelt at 40, over Mon to Wed.");
  });

  it("says each slice's value and share", () => {
    expect(chartSummary("donut", [{ name: "Sales", data: [30, 10] }], ["Bread", "Rolls"], format))
      .toBe("Donut chart of Sales: Bread 30 (75%), Rolls 10 (25%).");
  });
});
