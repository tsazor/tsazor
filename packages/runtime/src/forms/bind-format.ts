/**
 * `@bind:format` — Blazor's BindConverter.FormatValue/ParseValue subset
 * (roadmap 3.7): date and number binds render through, and re-parse with, an
 * explicit format string. Invariant culture only — Tsazor has no CultureInfo
 * ports (the A5/B7 culture policy: all routing and data values are invariant).
 *
 * The compiler (codegen.ts emitBind) emits these for `@bind` on number and
 * date inputs with `@bind:format`; every other bind keeps its native round
 * trip (strings carry no format, exactly like .NET's BindConverter, which
 * applies formats only to types that have one).
 *
 * Subset (documented deviation from .NET's full format grammar):
 * - numbers: `F<n>` (fixed), `N<n>` (grouped), and the digit masks `0`,
 *   `0.00`, `#,##0.0` (decimal count from the mask, grouping when the mask
 *   holds a `,`). Anything else formats as the number's string.
 * - dates: the tokens `yyyy`, `yy`, `MM`, `dd`, `HH`, `mm`, `ss`, `M`, `d`,
 *   `H`, `m`, `s`; every other character is literal text.
 */

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

/** .NET's BindConverter.FormatValue for the number/date subset; null/undefined → "". */
export function formatValue(value: unknown, format: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!NUMBER_MASK.test(format) && !FIXED.test(format) && !GROUPED.test(format)) return String(value);
    const sign = value < 0 ? "-" : "";
    const text = Math.abs(value).toFixed(decimalsOf(format));
    const [integral, fraction] = text.split(".");
    const grouped = format.includes(",") || GROUPED.test(format) ? group(integral!) : integral!;
    return `${sign}${grouped}${fraction ? `.${fraction}` : ""}`;
  }
  if (value instanceof Date) return formatDate(value, format);
  return String(value);
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
 */
export function parseValue(text: string, format: string): string | number | Date | null {
  if (NUMBER_MASK.test(format) || FIXED.test(format) || GROUPED.test(format)) {
    // Empty text fails like .NET's TryParse(""), not as 0.
    if (text.trim().length === 0) return null;
    const parsed = Number(text.replace(/[,\s]/g, ""));
    return Number.isNaN(parsed) ? null : parsed;
  }
  return parseDate(text, format);
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