/**
 * The component library's own texts (B29): English by default, an app table's `tsazor.ui.*` entry wins, counts go by
 * the culture's plural rules, and a missing key stays silent (the library has its own fallback).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { CultureService, StringLocalizer } from "@tsazor/runtime";
import { libraryTextDefaults, libraryTextKey } from "../src/index";
import {
  carouselLabelsFrom, dateFieldPlaceholder, describeColor, englishLibraryTexts, libraryPlural, libraryText,
  ratingLabelsFrom,
} from "../src/kit";

function localizer(culture: string, tables: Record<string, Record<string, string>> = {}) {
  return new StringLocalizer({ culture: new CultureService(culture), tables, defaultCulture: "en" });
}

afterEach(() => vi.restoreAllMocks());

describe("library texts", () => {
  it("are English without a table entry, their placeholders filled, and silent about the missing key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const L = localizer("de-DE");
    expect(libraryText(L, "close")).toBe("Close");
    expect(libraryText(L, "paginator.page", { page: 2, pages: 7 })).toBe("Page 2 of 7");
    expect(warn).not.toHaveBeenCalled();
  });

  it("take the app table's entry under the reserved key, for the culture or its parent", () => {
    const L = localizer("de-DE", { de: { [libraryTextKey("paginator.page")]: "Seite {page} von {pages}", "tsazor.ui.close": "Schließen" } });
    expect(libraryTextKey("paginator.page")).toBe("tsazor.ui.paginator.page");
    expect(libraryText(L, "paginator.page", { page: 2, pages: 7 })).toBe("Seite 2 von 7");
    expect(libraryText(L, "close")).toBe("Schließen");
  });

  it("choose the entry of a count's plural category in the culture, the count written as the culture writes it", () => {
    const ru = localizer("ru-RU", {
      ru: {
        "tsazor.ui.rating.stars.one": "{count} звезда",
        "tsazor.ui.rating.stars.few": "{count} звезды",
        "tsazor.ui.rating.stars.many": "{count} звёзд",
      },
    });
    expect([1, 3, 5, 21].map((count) => libraryPlural(ru, "rating.stars", count))).toEqual(["1 звезда", "3 звезды", "5 звёзд", "21 звезда"]);
    const en = localizer("en-US");
    expect([1, 3, 1234].map((count) => libraryPlural(en, "paginator.items", count))).toEqual(["1 item", "3 items", "1,234 items"]);
    const de = localizer("de-DE");
    expect(libraryPlural(de, "paginator.items", 1234)).toBe("1.234 items");
  });

  it("build the label objects of the components: carousel, rating, the color names", () => {
    const L = localizer("de-DE", {
      de: {
        "tsazor.ui.carousel.slide": "{position} von {count}",
        "tsazor.ui.rating.displayWithCount": "Bewertet mit {value} von {max}, {ratings}",
        "tsazor.ui.rating.ratings.one": "{count} Bewertung",
        "tsazor.ui.rating.ratings.other": "{count} Bewertungen",
        "tsazor.ui.color.blue": "blau",
        "tsazor.ui.color.dark": "dunkel{color}",
      },
    });
    const t = Object.assign((text: never, params?: Record<string, unknown>) => libraryText(L, text, params), {
      plural: (text: never, count: number, params?: Record<string, unknown>) => libraryPlural(L, text, count, params),
    });
    expect(carouselLabelsFrom(t).slide(1, 5)).toBe("2 von 5");
    expect(ratingLabelsFrom(t).display("3,5", 5, "1.234")).toBe("Bewertet mit 3,5 von 5, 1.234 Bewertungen");
    expect(describeColor("#0d2a6b", t)).toBe("dunkelblau");
    expect(describeColor("#0d2a6b")).toBe("dark blue");
  });

  it("write a date field's placeholder in the language's letters (German: TT.MM.JJJJ)", () => {
    const L = localizer("de-DE", { de: { "tsazor.ui.dateField.day": "TT", "tsazor.ui.dateField.year": "JJJJ" } });
    const t = Object.assign((text: never, params?: Record<string, unknown>) => libraryText(L, text, params), {
      plural: (text: never, count: number, params?: Record<string, unknown>) => libraryPlural(L, text, count, params),
    });
    expect(dateFieldPlaceholder("de-DE", t)).toBe("TT.MM.JJJJ");
    expect(dateFieldPlaceholder("en-US")).toBe("MM/DD/YYYY");
  });

  it("keep the English defaults as the components' label constants", () => {
    expect(englishLibraryTexts("remove", { name: "Rye" })).toBe("Remove Rye");
    expect(englishLibraryTexts.plural("rating.stars", 1)).toBe("1 star");
    expect(Object.keys(libraryTextDefaults).every((name) => /^[a-z][A-Za-z]*(\.[a-z][A-Za-z]*)*$/.test(name))).toBe(true);
  });
});
