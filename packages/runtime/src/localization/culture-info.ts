/**
 * CultureInfo — Blazor's System.Globalization.CultureInfo counterpart, built on
 * Intl (E8, design-localization.md). Immutable and thin: the locale tag is the
 * only state, everything formatting goes to Intl (no BCL clones — no calendars,
 * TextInfo or CompareInfo ports).
 *
 * The invariant culture ("") is .NET's InvariantCulture: `en-US` formatting
 * fixed, with no locale negotiation — `Intl`'s own default (the runtime
 * locale) would otherwise leak into "invariant" output.
 */
/** .NET's NumberFormatInfo, the parts a numeric input needs (the .NET property names, camelCased). */
export interface NumberFormatInfo {
  /** "," in de-DE, "." in en-US. */
  readonly numberDecimalSeparator: string;
  /** "." in de-DE, "," in en-US; "" in a locale that doesn't group digits. */
  readonly numberGroupSeparator: string;
  readonly percentSymbol: string;
  readonly negativeSign: string;
  readonly positiveSign: string;
  /** "NaN" in most locales. */
  readonly nanSymbol: string;
  /** Intl's "∞" (.NET's invariant culture writes "Infinity"). */
  readonly positiveInfinitySymbol: string;
}

export class CultureInfo {
  /** .NET's CultureInfo.InvariantCulture (name "", formatting fixed to en-US). */
  static readonly invariant: CultureInfo = new CultureInfo("");

  /** The locale tag as written: "" (invariant) or e.g. "de-DE". */
  readonly name: string;
  /** @internal The tag handed to Intl ("en-US" for the invariant culture). */
  readonly #locale: string;

  /**
   * `new CultureInfo("de-DE")`. A malformed tag throws here, like .NET's
   * CultureNotFoundException — better at construction than at every Intl
   * call. A well-formed tag without data ("xx-XX") is accepted; Intl falls
   * back internally.
   */
  constructor(locale: string) {
    if (typeof locale !== "string") throw new Error(`CultureInfo: expected a locale string, got '${String(locale)}'.`);
    if (locale !== "") {
      try {
        Intl.getCanonicalLocales(locale);
      } catch {
        throw new Error(`CultureInfo: '${locale}' is not a valid culture name.`);
      }
    }
    this.name = locale;
    this.#locale = locale === "" ? "en-US" : locale;
  }

  /** The culture's own name for itself, like .NET's NativeName ("Deutsch (Deutschland)"). */
  get displayName(): string {
    if (this.name === "") return "Invariant Language (Invariant Country)";
    return new Intl.DisplayNames([this.#locale], { type: "language" }).of(this.#locale) ?? this.name;
  }

  #numberFormatInfo: NumberFormatInfo | undefined;

  /**
   * .NET's NumberFormat (a NumberFormatInfo): the culture's separators and signs, for a numeric input that formats
   * and reads text itself — `new CultureInfo("de-DE").numberFormatInfo.numberDecimalSeparator` is ",". Read from
   * Intl. No currency symbol: Intl knows a currency's symbol, not a culture's own currency — format money with
   * `numberFormat({ style: "currency", currency: "EUR" })`.
   */
  get numberFormatInfo(): NumberFormatInfo {
    if (this.#numberFormatInfo === undefined) {
      const part = (value: number, type: Intl.NumberFormatPartTypes, fallback: string, options?: Intl.NumberFormatOptions): string =>
        new Intl.NumberFormat(this.#locale, options).formatToParts(value).find((candidate) => candidate.type === type)?.value ?? fallback;
      this.#numberFormatInfo = Object.freeze({
        numberDecimalSeparator: part(1234567.891, "decimal", "."),
        numberGroupSeparator: part(1234567.891, "group", ""),
        percentSymbol: part(0.5, "percentSign", "%", { style: "percent" }),
        negativeSign: part(-1, "minusSign", "-"),
        positiveSign: part(1, "plusSign", "+", { signDisplay: "always" }),
        nanSymbol: part(Number.NaN, "nan", "NaN"),
        positiveInfinitySymbol: part(Number.POSITIVE_INFINITY, "infinity", "∞"),
      });
    }
    return this.#numberFormatInfo;
  }

  /** The culture's number format (thin `Intl.NumberFormat` wrapper). */
  numberFormat(options?: Intl.NumberFormatOptions): Intl.NumberFormat {
    return new Intl.NumberFormat(this.#locale, options);
  }

  /** The culture's date format (thin `Intl.DateTimeFormat` wrapper). */
  dateFormat(options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
    return new Intl.DateTimeFormat(this.#locale, options);
  }

  /** Formats a number in this culture, e.g. `culture.formatNumber(1234.5)` → "1.234,5" (de-DE). */
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
    return this.numberFormat(options).format(value);
  }

  /** Formats a date in this culture, e.g. `culture.formatDate(new Date(), { dateStyle: "long" })`. */
  formatDate(value: Date, options?: Intl.DateTimeFormatOptions): string {
    return this.dateFormat(options).format(value);
  }

  /** @internal The Intl locale tag (used by the bind culture path). */
  get locale(): string {
    return this.#locale;
  }
}

/** Normalizes a culture argument (a tag or a CultureInfo) for the formatting paths. */
export function toCultureInfo(culture: string | CultureInfo): CultureInfo {
  return typeof culture === "string" ? new CultureInfo(culture) : culture;
}