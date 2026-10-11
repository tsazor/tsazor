import { describe, expect, it } from "vitest";
import { overflowFit } from "../src/overflow.js";

describe("overflowFit", () => {
  it("keeps all items when they fit, gaps included", () => {
    expect(overflowFit([50, 50, 50], 170, 30, 10)).toBe(3);
    // One px short: 169 - 30 - 10 = 129 leaves room for two (110).
    expect(overflowFit([50, 50, 50], 169, 30, 10)).toBe(2);
  });

  it("else as many as fit beside the +N button", () => {
    // Room for the items: 200 - 30 - 10 = 160: 50 + 10 + 50 = 110, + 10 + 50 = 170 > 160.
    expect(overflowFit([50, 50, 50, 50], 200, 30, 10)).toBe(2);
    expect(overflowFit([120, 40], 100, 30, 0)).toBe(0);
    expect(overflowFit([], 100, 30, 0)).toBe(0);
  });
});
