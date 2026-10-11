import { describe, expect, it } from "vitest";
import { carouselLabels, carouselRotates, carouselStep, carouselSwipe } from "../src/carousel.js";

describe("carousel", () => {
  it("steps through the slides, wrapping around", () => {
    expect(carouselStep(0, 1, 3)).toBe(1);
    expect(carouselStep(2, 1, 3)).toBe(0);
    expect(carouselStep(0, -1, 3)).toBe(2);
    expect(carouselStep(0, 1, 0)).toBeUndefined();
  });

  it("turns by itself only when nothing holds it (WCAG 2.2.2)", () => {
    const idle = { autoCycle: true, count: 3, paused: false, hovered: false, focused: false, reducedMotion: false };
    expect(carouselRotates(idle)).toBe(true);
    expect(carouselRotates({ ...idle, autoCycle: false })).toBe(false);
    expect(carouselRotates({ ...idle, count: 1 })).toBe(false);
    expect(carouselRotates({ ...idle, paused: true })).toBe(false);
    expect(carouselRotates({ ...idle, hovered: true })).toBe(false);
    expect(carouselRotates({ ...idle, focused: true })).toBe(false);
    expect(carouselRotates({ ...idle, reducedMotion: true })).toBe(false);
  });

  it("reads a swipe: right to left is next, a short or vertical one nothing; right to left pages swap", () => {
    expect(carouselSwipe(-80, 5)).toBe("next");
    expect(carouselSwipe(80, 5)).toBe("previous");
    expect(carouselSwipe(-20, 0)).toBeUndefined();
    expect(carouselSwipe(-60, 90)).toBeUndefined();
    expect(carouselSwipe(-80, 5, true)).toBe("previous");
  });

  it("names the slides and the bullets", () => {
    expect(carouselLabels.slide(1, 5)).toBe("2 of 5");
    expect(carouselLabels.bullet(0)).toBe("Slide 1");
  });
});
