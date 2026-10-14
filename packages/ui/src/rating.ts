/**
 * Ratings: MudBlazor's MudRating (stars someone picks) and Fluent UI Blazor's FluentRatingDisplay (stars that show a
 * value, halves too). Pure, so both skins draw the same behavior.
 */

import { englishLibraryTexts, type LibraryTexts } from "./library-texts.js";

/** How much of star `item` (1 to max) a value fills: 0, 1, or the fraction in between (3.5 fills half of the 4th). */
export function ratingFill(item: number, value: number): number {
  return Math.min(1, Math.max(0, value - (item - 1)));
}

/**
 * The value a key gives a rating (MudBlazor's keys): ArrowRight and ArrowUp one more, ArrowLeft and ArrowDown one
 * less (left and right swapped in a right-to-left page), with Shift the ends; Home 0, End the most. Undefined for any
 * other key, or when the value stays.
 */
export function ratingKeyTarget(key: { key: string; shiftKey?: boolean }, value: number, max: number, rtl = false): number | undefined {
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
  let next: number;
  switch (key.key) {
    case forward:
    case "ArrowUp":
      next = key.shiftKey ? max : value + 1;
      break;
    case back:
    case "ArrowDown":
      next = key.shiftKey ? 0 : value - 1;
      break;
    case "Home":
      next = 0;
      break;
    case "End":
      next = max;
      break;
    default:
      return undefined;
  }
  next = Math.min(max, Math.max(0, next));
  return next === value ? undefined : next;
}

/** What a click on star `item` makes the value: the star's, or none (0) when it is the value already (MudBlazor's). */
export function ratingClickValue(item: number, value: number): number {
  return item === value ? 0 : item;
}

/** The texts of a rating (English by default); a component takes them as `labels`. */
export interface RatingLabels {
  /** A star's name in a rating: "3 stars". */
  item: (value: number, max: number) => string;
  /** A rating display's text alternative: "Rated 3.5 out of 5, 1,234 ratings". */
  display: (value: string, max: number, count: string | undefined) => string;
}

/**
 * The rating's texts from the library texts (`tsazor.ui.rating.*`, plural by the culture's rules):
 * `{ ...ratingLabelsFrom(t), ...labels }`. The display's count is a whole number as the locale writes it.
 */
export function ratingLabelsFrom(t: LibraryTexts): RatingLabels {
  return {
    item: (value) => t.plural("rating.stars", value),
    display: (value, max, count) =>
      count === undefined
        ? t("rating.display", { value, max })
        : t("rating.displayWithCount", { value, max, ratings: t.plural("rating.ratings", Number(count.replace(/\D/g, "")), { count }) }),
  };
}

/** A rating value as the locale writes it, one decimal at most: "3.5", "3,5" (de-DE), "4". */
export function formatRatingValue(value: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}

/** A number of ratings with the locale's thousands separator: "1,234", "1.234" (de-DE). */
export function formatRatingCount(count: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(count);
}
