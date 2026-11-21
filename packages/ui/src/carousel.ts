/**
 * A carousel (MudBlazor's MudCarousel; the WAI-ARIA carousel pattern): which slide comes next, and when it turns by
 * itself. Pure, so both skins draw the same behavior.
 */

import { englishLibraryTexts, type LibraryTexts } from "./library-texts.js";

/** The slide `step` slides from `index` (wrapping around), or undefined when there are none. */
export function carouselStep(index: number, step: number, count: number): number | undefined {
  if (count <= 0) return undefined;
  return (((index + step) % count) + count) % count;
}

/**
 * Whether the slides turn by themselves now: only with `autoCycle`, more than one slide, and while nobody has paused
 * them, holds the pointer over them or has the focus in them (WCAG 2.2.2), and — when `reducedMotion` is given — the
 * page doesn't ask for reduced motion. The skins start paused under reduced motion instead, so their start button
 * turns the slides all the same.
 */
export function carouselRotates(state: { autoCycle: boolean; count: number; paused: boolean; hovered: boolean; focused: boolean; reducedMotion?: boolean }): boolean {
  return state.autoCycle && state.count > 1 && !state.paused && !state.hovered && !state.focused && state.reducedMotion !== true;
}

/** Which way a swipe went: "next" for right to left (left to right in a right-to-left page), "previous" the other way, undefined for a short or a mostly vertical one. */
export function carouselSwipe(dx: number, dy: number, rtl = false, threshold = 40): "next" | "previous" | undefined {
  if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return undefined;
  const leftward = dx < 0;
  return leftward !== rtl ? "next" : "previous";
}

/** The texts of a carousel (English by default); a component takes them as `labels`. */
export interface CarouselLabels {
  /** The previous button. */
  previous: string;
  /** The next button. */
  next: string;
  /** A slide's name: "2 of 5". */
  slide: (index: number, count: number) => string;
  /** A bullet's name: "Slide 2". */
  bullet: (index: number) => string;
  /** The button that stops the slides turning. */
  pause: string;
  /** The button that starts them again. */
  play: string;
}

/** The carousel's texts from the library texts (`tsazor.ui.carousel.*`): `{ ...carouselLabelsFrom(t), ...labels }`. */
export function carouselLabelsFrom(t: LibraryTexts): CarouselLabels {
  return {
    previous: t("carousel.previous"),
    next: t("carousel.next"),
    slide: (index, count) => t("carousel.slide", { position: index + 1, count }),
    bullet: (index) => t("carousel.bullet", { position: index + 1 }),
    pause: t("carousel.pause"),
    play: t("carousel.play"),
  };
}
