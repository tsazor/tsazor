import { describe, expect, it } from "vitest";
import { formatRatingCount, formatRatingValue, ratingClickValue, ratingFill, ratingKeyTarget, ratingLabelsFrom } from "../src/rating.js";
import { englishLibraryTexts } from "../src/library-texts.js";

const ratingLabels = ratingLabelsFrom(englishLibraryTexts);

describe("ratings", () => {
  it("fills the stars up to the value, a fraction for the one in between", () => {
    expect([1, 2, 3, 4, 5].map((item) => ratingFill(item, 3.5))).toEqual([1, 1, 1, 0.5, 0]);
    expect([1, 2].map((item) => ratingFill(item, 0))).toEqual([0, 0]);
    expect(ratingFill(5, 7)).toBe(1);
  });

  it("moves the value with the keys, within 0 and the most, the arrows swapped right to left", () => {
    expect(ratingKeyTarget({ key: "ArrowRight" }, 2, 5)).toBe(3);
    expect(ratingKeyTarget({ key: "ArrowUp" }, 2, 5)).toBe(3);
    expect(ratingKeyTarget({ key: "ArrowLeft" }, 2, 5)).toBe(1);
    expect(ratingKeyTarget({ key: "ArrowDown" }, 1, 5)).toBe(0);
    expect(ratingKeyTarget({ key: "ArrowRight", shiftKey: true }, 2, 5)).toBe(5);
    expect(ratingKeyTarget({ key: "ArrowLeft", shiftKey: true }, 2, 5)).toBe(0);
    expect(ratingKeyTarget({ key: "Home" }, 3, 5)).toBe(0);
    expect(ratingKeyTarget({ key: "End" }, 3, 5)).toBe(5);
    expect(ratingKeyTarget({ key: "ArrowRight" }, 5, 5)).toBeUndefined();
    expect(ratingKeyTarget({ key: "ArrowLeft" }, 0, 5)).toBeUndefined();
    expect(ratingKeyTarget({ key: "ArrowLeft" }, 2, 5, true)).toBe(3);
    expect(ratingKeyTarget({ key: "Enter" }, 2, 5)).toBeUndefined();
  });

  it("clears with a click on the star of the value", () => {
    expect(ratingClickValue(3, 2)).toBe(3);
    expect(ratingClickValue(3, 3)).toBe(0);
  });

  it("names the stars and the display, and writes the numbers as the locale does", () => {
    expect(ratingLabels.item(1, 5)).toBe("1 star");
    expect(ratingLabels.item(4, 5)).toBe("4 stars");
    expect(ratingLabels.display("3.5", 5, "1,234")).toBe("Rated 3.5 out of 5, 1,234 ratings");
    expect(ratingLabels.display("4", 5, undefined)).toBe("Rated 4 out of 5");
    expect(formatRatingValue(3.5, "de-DE")).toBe("3,5");
    expect(formatRatingValue(4, "en-US")).toBe("4");
    expect(formatRatingValue(4.25, "en-US")).toBe("4.3");
    expect(formatRatingCount(1234, "en-US")).toBe("1,234");
    expect(formatRatingCount(1234, "de-DE")).toBe("1.234");
  });
});
