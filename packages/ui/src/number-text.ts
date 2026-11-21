/**
 * A number's text in a locale's separators, for a field the user edits (the skins' DecimalInput): the invariant text
 * — exact, from the value's own digits — with its decimal point and group commas swapped for the locale's. The digits
 * stay Latin and the minus stays the hyphen, so the text can be edited and parsed back as typed.
 */

/** The locale's decimal and group separators (`Intl`): de-DE `{ decimal: ",", group: "." }`. */
export function numberSeparators(locale: string): { decimal: string; group: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234567.891);
  return {
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ".",
    group: parts.find((part) => part.type === "group")?.value ?? "",
  };
}

/** `invariant` ("1,234.50") in the locale's separators: "1.234,50" in de-DE, "1 234,50" in fr-FR. */
export function localizeNumberText(invariant: string, locale: string): string {
  const { decimal, group } = numberSeparators(locale);
  if (decimal === "." && group === ",") return invariant;
  let text = "";
  for (const char of invariant) text += char === "." ? decimal : char === "," ? group : char;
  return text;
}
