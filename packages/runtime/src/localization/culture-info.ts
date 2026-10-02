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