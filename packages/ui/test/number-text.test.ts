/** A number's invariant text in a locale's separators, for an editable field (the skins' DecimalInput). */
import { describe, expect, it } from "vitest";
import { localizeNumberText, numberSeparators } from "../src/number-text";

describe("localizeNumberText", () => {
  it("swaps the decimal point and the group commas for the locale's", () => {
    expect(localizeNumberText("1,234.50", "de-DE")).toBe("1.234,50");
    expect(localizeNumberText("-0.5", "de-DE")).toBe("-0,5");
    expect(localizeNumberText("1,234.50", "en-US")).toBe("1,234.50");
    expect(localizeNumberText("1,234.5", "fr-FR")).toBe(`1${numberSeparators("fr-FR").group}234,5`);
  });

  it("keeps the digits Latin and the minus the hyphen, so the text parses back as typed", () => {
    // ar-EG writes Arabic-Indic digits and U+066B; the field keeps the Latin digits with the locale's separator.
    expect(localizeNumberText("-12.5", "ar-EG")).toBe(`-12${numberSeparators("ar-EG").decimal}5`);
    expect(numberSeparators("ar-EG").decimal).toBe("٫");
    expect(localizeNumberText("-1.5", "sv-SE")).toBe("-1,5");
  });
});
