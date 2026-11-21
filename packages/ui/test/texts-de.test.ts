/**
 * The German framework texts (@tsazor/ui/texts/de): every library text and validation message, each with exactly
 * the placeholders of its English text, in use through a StringLocalizer.
 */
import { describe, expect, it } from "vitest";
import { CultureService, StringLocalizer } from "@tsazor/runtime";
import { libraryText, libraryPlural, libraryTextDefaults, libraryTextKey, type LibraryText } from "../src/library-texts";
import { germanFrameworkTexts } from "../src/texts/de";

const placeholders = (text: string): string[] => [...text.replace(/\{\{|\}\}/g, "").matchAll(/\{(\w+)\}/g)].map(([, name]) => name!).sort();

describe("germanFrameworkTexts", () => {
  it("has every library text, with the English text's placeholders", () => {
    for (const [name, english] of Object.entries(libraryTextDefaults)) {
      const german = (germanFrameworkTexts as Record<string, string>)[libraryTextKey(name)];
      expect(german, name).toBeDefined();
      expect(placeholders(german!), name).toEqual(placeholders(english));
    }
    const libraryKeys = Object.keys(germanFrameworkTexts).filter((key) => key.startsWith("tsazor.ui."));
    expect(libraryKeys).toHaveLength(Object.keys(libraryTextDefaults).length);
  });

  it("localizes the components and the plural texts in a German culture", () => {
    const localizer = new StringLocalizer({ culture: new CultureService("de-DE"), tables: { "de-DE": germanFrameworkTexts }, defaultCulture: "de-DE" });
    expect(libraryText(localizer, "paginator.page" as LibraryText, { page: 2, pages: 7 })).toBe("Seite 2 von 7");
    expect(libraryPlural(localizer, "paginator.items", 1)).toBe("1 Eintrag");
    expect(libraryPlural(localizer, "paginator.items", 1234)).toBe("1.234 Einträge");
    localizer.dispose();
  });
});
