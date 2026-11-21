import { afterEach, describe, expect, it } from "vitest";
import { CultureService, StringLocalizer } from "../src/index";

afterEach(() => {
  document.documentElement.lang = "en";
});

const tables = { en: { hello: "Hello" }, de: { hello: "Hallo" }, ar: { hello: "مرحبا" } };

describe("<html lang> follows the language of the texts (WCAG 3.1.1; the BlazorHero port's B34)", () => {
  it("is the current culture when a table serves it, a parent's too, and follows a change", () => {
    const culture = new CultureService("en");
    culture.setExplicit("ar-SA");
    new StringLocalizer({ tables, defaultCulture: "en", culture, documentLanguage: true });
    expect(document.documentElement.lang).toBe("ar-SA");
    culture.setExplicit("de-DE");
    expect(document.documentElement.lang).toBe("de-DE");
  });

  it("is the default culture when no table serves the current one (its texts are the fallback's)", () => {
    const culture = new CultureService("en");
    culture.setExplicit("pt-BR");
    new StringLocalizer({ tables, defaultCulture: "en", culture, documentLanguage: true });
    expect(document.documentElement.lang).toBe("en");
  });

  it("is left alone without the option, and without tables", () => {
    const culture = new CultureService("en");
    culture.setExplicit("de-DE");
    new StringLocalizer({ tables, defaultCulture: "en", culture });
    expect(document.documentElement.lang).toBe("en");
    new StringLocalizer({ culture, documentLanguage: true });
    expect(document.documentElement.lang).toBe("en");
  });
});
