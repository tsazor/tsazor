/**
 * `@bind:format` — Blazor's BindConverter.FormatValue/ParseValue subset
 * (roadmap 3.7): date and number binds render through, and re-parse with, an
 * explicit format string. Invariant culture only — Tsazor has no CultureInfo
 * ports (the A5/B7 culture policy: all routing and data values are invariant).
 *
 * E8 extension (design-localization.md §5): the third, optional `culture`
 * argument (`@bind:culture`) routes numbers through `Intl` — grouping and
 * separators follow the locale — while everything without a culture stays
 * exactly on the invariant path above. Dates keep the ISO default (a date
 * input's value is ISO by the browser's contract), so a culture on a date
 * bind is inert (a compile-time warning); display-side culture formatting
 * lives on `CultureInfo` (`formatNumber`/`formatDate`).
 *
 * The compiler (codegen.ts emitBind) emits these for `@bind` on number and
 * date inputs with `@bind:format`, and on number inputs with `@bind:culture`;
 * every other bind keeps its native round trip (strings carry no format,
 * exactly like .NET's BindConverter, which applies formats only to types
 * that have one).
 *
 * Subset (documented deviation from .NET's full format grammar):
 * - numbers: `F<n>` (fixed), `N<n>` (grouped), and the digit masks `0`,
 *   `0.00`, `#,##0.0` (decimal count from the mask, grouping when the mask
 *   holds a `,`). Anything else formats as the number's string.
 * - dates: the tokens `yyyy`, `yy`, `MM`, `dd`, `HH`, `mm`, `ss`, `M`, `d`,
 *   `H`, `m`, `s`; every other character is literal text.
 */
import { CultureInfo, toCultureInfo } from "../localization/culture-info.js";

const NUMBER_MASK = /^[\d#,]*(?:\.[\d#]*)?$/;
const FIXED = /^F(\d)?$/;
const GROUPED = /^N(\d)?$/;

type DatePart = "year" | "year2" | "month" | "day" | "hour" | "minute" | "second";

const DATE_TOKENS: readonly (readonly [token: string, type: DatePart, pattern: string])[] = [
  ["yyyy", "year", "([0-9]{4})"],
  ["yy", "year2", "([0-9]{2})"],
  ["MM", "month", "([0-9]{2})"],
  ["dd", "day", "([0-9]{2})"],
  ["HH", "hour", "([0-9]{2})"],
  ["mm", "minute", "([0-9]{2})"],
  ["ss", "second", "([0-9]{2})"],
  ["M", "month", "([0-9]{1,2})"],
  ["d", "day", "([0-9]{1,2})"],
  ["H", "hour", "([0-9]{1,2})"],
  ["m", "minute", "([0-9]{1,2})"],
  ["s", "second", "([0-9]{1,2})"],
];

/**
 * .NET's BindConverter.FormatValue for the number/date subset; null/undefined → "".
 * E8: with a (non-invariant) `culture`, numbers format through `Intl` — the
 * format's digit count still applies; grouping and separators follow the
 * locale. Without a culture everything is invariant (A5/B7).
 */
export function formatValue(value: unknown, format: string | undefined, culture?: string | CultureInfo): string {
  if (value === null || value === undefined) return "";
  const info = culture === undefined ? undefined : toCultureInfo(culture);
  if (typeof value === "number") {
    if (info !== undefined && info.name !== "") return formatNumberCulture(value, format, info);
    if (format === undefined) return String(value);
    if (!NUMBER_MASK.test(format) && !FIXED.test(format) && !GROUPED.test(format)) return String(value);
    const sign = value < 0 ? "-" : "";
    const text = Math.abs(value).toFixed(decimalsOf(format));
    const [integral, fraction] = text.split(".");
    const grouped = format.includes(",") || GROUPED.test(format) ? group(integral!) : integral!;
    return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
  }
  if (value instanceof Date) return formatDate(value, format ?? "yyyy-MM-dd");
  return String(value);
}

/**
 * A number in a culture: `Intl.NumberFormat` with the format's digits (F/N
 * and masks like the invariant path; without a format, `Intl`'s own digit
 * default), grouping only where the format asks for it (`N`, a `,` mask).
 */
function formatNumberCulture(value: number, format: string | undefined, info: CultureInfo): string {
  const options: Intl.NumberFormatOptions = {};
  if (format !== undefined && (NUMBER_MASK.test(format) || FIXED.test(format) || GROUPED.test(format))) {
    options.minimumFractionDigits = decimalsOf(format);
    options.maximumFractionDigits = decimalsOf(format);
    options.useGrouping = format.includes(",") || GROUPED.test(format);
  }
  return info.numberFormat(options).format(value);
}

/** The mask's decimal count (`F`/`N` default 0, `0` masks count their digits). */
function decimalsOf(format: string): number {
  const fixed = FIXED.exec(format) ?? GROUPED.exec(format);
  if (fixed) return Number(fixed[1] ?? 0);
  if (!NUMBER_MASK.test(format)) return 0;
  const dot = format.indexOf(".");
  return dot === -1 ? 0 : format.slice(dot + 1).replace(/[^0#]/g, "").length;
}

/** Invariant grouping: commas every three digits. */
function group(integral: string): string {
  return integral.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Formats a Date with the token subset (every other character literal). */
function formatDate(date: Date, format: string): string {
  const getters: Record<DatePart, string> = {
    year: String(date.getFullYear()).padStart(4, "0"),
    year2: String(date.getFullYear() % 100).padStart(2, "0"),
    month: String(date.getMonth() + 1).padStart(2, "0"),
    day: String(date.getDate()).padStart(2, "0"),
    hour: String(date.getHours()).padStart(2, "0"),
    minute: String(date.getMinutes()).padStart(2, "0"),
    second: String(date.getSeconds()).padStart(2, "0"),
  };
  const singles: Record<DatePart, string> = {
    year: String(date.getFullYear()),
    year2: String(date.getFullYear() % 100).padStart(2, "0"),
    month: String(date.getMonth() + 1),
    day: String(date.getDate()),
    hour: String(date.getHours()),
    minute: String(date.getMinutes()),
    second: String(date.getSeconds()),
  };
  let result = "";
  let i = 0;
  while (i < format.length) {
    const token = DATE_TOKENS.find(([t]) => format.startsWith(t, i));
    if (token) {
      const [name, part] = token;
      result += name === "M" || name === "d" || name === "H" || name === "m" || name === "s" ? singles[part]! : getters[part]!;
      i += name.length;
    } else {
      result += format[i]!;
      i++;
    }
  }
  return result;
}

/**
 * .NET's BindConverter.TryParse for the subset: numbers parse invariant
 * (thousands separators and whitespace removed), dates parse by the format's
 * tokens. Returns null for a value the format cannot accept — the generated
 * handler then keeps the model's previous value, like the no-format number
 * bind's NaN guard.
 *
 * E8: with a (non-invariant) `culture`, numbers parse in the culture's
 * grammar — the group/decimal separators and minus sign come from
 * `Intl.NumberFormat().formatToParts()`, so "1.234,5" parses as 1234.5 in
 * de-DE. Without a culture everything is invariant (A5/B7).
 */
export function parseValue(text: string, format: string | undefined, culture?: string | CultureInfo): string | number | Date | null {
  const info = culture === undefined ? undefined : toCultureInfo(culture);
  if (info !== undefined && info.name !== "" && (format === undefined || NUMBER_MASK.test(format) || FIXED.test(format) || GROUPED.test(format))) {
    return parseNumberCulture(text, info);
  }
  if (format === undefined) return null;
  if (NUMBER_MASK.test(format) || FIXED.test(format) || GROUPED.test(format)) {
    // Empty text fails like .NET's TryParse(""), not as 0.
    if (text.trim().length === 0) return null;
    const parsed = Number(text.replace(/[,\s]/g, ""));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return parseDate(text, format);
}

/** A number in the culture's grammar (separators from Intl); null when the text does not match it. */
function parseNumberCulture(text: string, info: CultureInfo): string | number | Date | null {
  if (text.trim().length === 0) return null;
  const parts = info.numberFormat().formatToParts(1234567.891);
  const group = parts.find((part) => part.type === "group")?.value ?? "";
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const minus = parts.find((part) => part.type === "minusSign")?.value ?? "-";
  // The culture's accepted shape: an optional sign, digits with the culture's
  // group separators, and its decimal separator. Anything else (e.g. the
  // invariant "1,234.5" in de-DE, where "," is not the group separator) is a
  // parse failure, like .NET's culture-bound TryParse.
  const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The culture's accepted shape: an optional sign, digits with the culture's
  // group separators, and its decimal separator. Anything else (e.g. the
  // invariant "1,234.5" in de-DE, where "," is not the group separator) is a
  // parse failure, like .NET's culture-bound TryParse. A locale without a
  // group separator takes plain digits.
  const groupPattern = group === "" ? "" : `\\d{1,3}(?:${escaped(group)}\\d{3})*`;
  const shape = new RegExp(`^\\s*(${escaped(minus)})?${groupPattern || "\\d+"}(?:${escaped(decimal)}\\d+)?\\s*$`);
  const source = text.trim();
  if (!shape.test(source)) return null;
  const normalized = source
    .split(minus)
    .join("-")
    .split(group)
    .join("")
    .split(decimal)
    .join(".");
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Parses a date by building a regex from the format's tokens (order mapped per group). */
function parseDate(text: string, format: string): Date | null {
  let source = "^";
  const parts: DatePart[] = [];
  let i = 0;
  while (i < format.length) {
    const token = DATE_TOKENS.find(([t]) => format.startsWith(t, i));
    if (token) {
      source += token[2];
      parts.push(token[1]);
      i += token[0].length;
    } else {
      source += format[i]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i++;
    }
  }
  const match = new RegExp(`${source}$`).exec(text.trim());
  if (!match) return null;
  const values: Partial<Record<DatePart, number>> = {};
  for (let j = 0; j < parts.length; j++) {
    values[parts[j]!] = Number(match[j + 1]);
  }
  const year = values.year !== undefined ? values.year : values.year2 !== undefined ? 2000 + values.year2 : NaN;
  const month = (values.month ?? 1) - 1;
  const day = values.day ?? 1;
  const date = new Date(year, month, day, values.hour ?? 0, values.minute ?? 0, values.second ?? 0);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
  return date;
}