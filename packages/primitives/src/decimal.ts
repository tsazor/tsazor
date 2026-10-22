/**
 * `Decimal` — an immutable, arbitrary-precision base-10 number, .NET's
 * `System.Decimal` in spirit: a BigInt scaled integer, so `0.1 + 0.2` is `0.3`,
 * not `0.30000000000000004`. `number` stays the type for measurements and
 * counts; `Decimal` is for money and anything that must not drift
 * (design-extensions-primitives.md §Decimal).
 *
 * Semantics follow .NET where they matter:
 * - The **scale** (the number of decimal digits) is preserved — `"19.90"` stays
 *   `"19.90"`, `"19.9"` stays `"19.9"`, like `decimal`'s trailing zeros.
 * - `equals`/`compare` compare the **value** (scale-aligned), so `19.90` equals
 *   `19.9` — .NET's `decimal` equality.
 * - `round` uses .NET's `MidpointRounding` modes, `toEven` (banker's) by
 *   default, as `Math.Round`.
 * - **Wire format: a string.** `toJSON()` returns `toString()`, so a `Decimal`
 *   serializes as `"19.99"` — JSON numbers lose precision, ASP.NET can write
 *   `decimal` as a string (`JsonNumberHandling.WriteAsString`).
 *
 * `format` goes through `Intl.NumberFormat` (as the design intends); `Intl`
 * works on `number`, so beyond ~15 significant digits `toString()` is the exact
 * rendering and `format` the display one.
 */
export type MidpointRounding = "toEven" | "awayFromZero" | "toZero" | "toPositive" | "toNegative";

/** 10^n as a BigInt. */
function pow10(n: number): bigint {
  return 10n ** BigInt(n);
}

/**
 * Rounds the sign-carrying quotient `numerator / divisor` with a midpoint mode.
 * The remainder inherits the numerator's sign (BigInt truncates toward zero),
 * so a negative value rounds symmetrically — .NET's `Math.Round` behavior.
 */
function divideRounded(numerator: bigint, divisor: bigint, mode: MidpointRounding): bigint {
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  if (remainder === 0n) return quotient;
  const negative = numerator < 0n;
  const absRem = negative ? -remainder : remainder;
  const doubleAbsRem = absRem * 2n;
  const isHalf = doubleAbsRem === divisor;
  const isMore = doubleAbsRem > divisor;
  const roundUp =
    mode === "toEven" ? isMore || (isHalf && (quotient & 1n) !== 0n)
    : mode === "awayFromZero" ? isMore || isHalf
    : mode === "toZero" ? false
    : mode === "toPositive" ? !negative
    : negative;
  if (!roundUp) return quotient;
  const increment = mode === "toPositive" ? 1n : mode === "toNegative" ? -1n : negative ? -1n : 1n;
  return quotient + increment;
}

/** The invariant `decimal` grammar (`.`, optional `,` grouping, an optional sign). */
function parseInvariant(text: string): Decimal | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  let sign = 1n;
  let rest = trimmed;
  if (rest[0] === "+" || rest[0] === "-") {
    if (rest[0] === "-") sign = -1n;
    rest = rest.slice(1);
  }
  rest = rest.replace(/[,\s]/g, "");
  const match = /^(\d*)(?:\.(\d*))?$/.exec(rest);
  if (match === null || (match[1] === "" && match[2] === "")) return null;
  const integral = match[1] === "" ? "0" : match[1];
  const fraction = match[2] ?? "";
  return new Decimal(BigInt(integral + fraction) * sign, fraction.length);
}

/** A culture's grammar (separators from `Intl`), normalized to invariant and parsed there. */
function parseCulture(text: string, culture: string): Decimal | null {
  // A negative sample: only then do the parts carry the culture's minus sign.
  const parts = new Intl.NumberFormat(culture).formatToParts(-1234567.891);
  const group = parts.find((part) => part.type === "group")?.value ?? "";
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const minus = parts.find((part) => part.type === "minusSign")?.value ?? "-";
  const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The group separators are optional (.NET's NumberStyles.Number: "1234,5" and "1.234,5" alike), and a space-like
  // one (fr-FR's U+202F) also matches the plain space people type; a culture whose minus is U+2212 (sv-SE) takes the
  // hyphen too (.NET's AllowHyphenDuringParsing).
  const spaceGroup = /^\s$/u.test(group);
  const separator = spaceGroup ? `[${escaped(group)} ]` : escaped(group);
  const integral = group === "" ? "\\d+" : `(?:\\d{1,3}(?:${separator}\\d{3})+|\\d+)`;
  const sign = minus === "-" ? "-" : `(?:${escaped(minus)}|-)`;
  const shape = new RegExp(`^\\s*(${sign})?${integral}(?:${escaped(decimal)}\\d+)?\\s*$`, "u");
  const source = text.trim();
  if (!shape.test(source)) return null;
  const withoutGroups = group === "" ? source : source.split(group).join("").split(spaceGroup ? " " : group).join("");
  const normalized = withoutGroups.split(minus).join("-").split(decimal).join(".");
  return parseInvariant(normalized);
}

export class Decimal {
  /** `0` (scale 0). */
  static readonly zero: Decimal = new Decimal(0n, 0);
  /** `1` (scale 0). */
  static readonly one: Decimal = new Decimal(1n, 0);

  /** The unscaled integer (`.NET`'s "unscaled value"); `unscaled / 10^scale`. */
  readonly unscaled: bigint;
  /** The number of decimal digits, ≥ 0 — `19.90` has scale 2 and stays so. */
  readonly scale: number;

  /** Builds from an unscaled BigInt and a scale: `new Decimal(1999n, 2)` is `19.99`. */
  constructor(unscaled: bigint, scale = 0) {
    if (scale < 0 || !Number.isInteger(scale)) throw new RangeError(`Decimal scale must be a non-negative integer, got ${scale}.`);
    this.unscaled = unscaled;
    this.scale = scale;
  }

  /** A decimal literal: `Decimal.from("19.99")`; a number reads its shortest round-trip string (so `from(0.1 + 0.2)` keeps the double's drift — use the string for exact). */
  static from(value: string | number): Decimal;
  /** An unscaled BigInt with a scale: `Decimal.from(1999n, 2)` is `19.99`. */
  static from(unscaled: bigint, scale?: number): Decimal;
  /** A `Decimal` passes through (the arithmetic methods accept a Decimal or a literal). */
  static from(value: Decimal): Decimal;
  static from(value: string | number | bigint | Decimal, scale?: number): Decimal {
    if (value instanceof Decimal) return value;
    if (typeof value === "bigint") return new Decimal(value, scale ?? 0);
    const parsed = parseInvariant(typeof value === "number" ? String(value) : value);
    if (parsed === null) throw new RangeError(`Decimal.from: not a decimal literal: ${JSON.stringify(value)}`);
    return parsed;
  }

  /** Parses a decimal in the invariant grammar, or in `culture`'s separators. Null when it does not match. */
  static parse(text: string, culture?: string): Decimal | null {
    return culture !== undefined && culture !== "" ? parseCulture(text, culture) : parseInvariant(text);
  }

  /** Coerces an arithmetic operand (a Decimal or a literal) to a Decimal; a bare BigInt is a scale-0 value. */
  private static coerce(value: Decimal | string | number | bigint): Decimal {
    if (value instanceof Decimal) return value;
    if (typeof value === "bigint") return new Decimal(value, 0);
    const parsed = parseInvariant(typeof value === "number" ? String(value) : value);
    if (parsed === null) throw new RangeError(`Decimal: not a decimal literal: ${JSON.stringify(value)}`);
    return parsed;
  }

  add(other: Decimal | string | number | bigint): Decimal {
    const o = Decimal.coerce(other);
    const scale = Math.max(this.scale, o.scale);
    return new Decimal(this.unscaled * pow10(scale - this.scale) + o.unscaled * pow10(scale - o.scale), scale);
  }

  sub(other: Decimal | string | number | bigint): Decimal {
    const o = Decimal.coerce(other);
    const scale = Math.max(this.scale, o.scale);
    return new Decimal(this.unscaled * pow10(scale - this.scale) - o.unscaled * pow10(scale - o.scale), scale);
  }

  mul(other: Decimal | string | number | bigint): Decimal {
    const o = Decimal.coerce(other);
    return new Decimal(this.unscaled * o.unscaled, this.scale + o.scale);
  }

  /**
   * Divides to `scale` decimal digits (default: the larger operand scale, so no
   * silent extra digits), rounded with `rounding` (`toEven` by default, as
   * `Math.Round`). Throws on division by zero, as .NET's `DivideByZeroException`.
   */
  div(other: Decimal | string | number | bigint, scale?: number, rounding: MidpointRounding = "toEven"): Decimal {
    const o = Decimal.coerce(other);
    if (o.unscaled === 0n) throw new RangeError("Decimal division by zero.");
    const target = scale ?? Math.max(this.scale, o.scale);
    // this / o = (this.unscaled * 10^o.scale) / (o.unscaled * 10^this.scale); × 10^target for the target scale.
    const numerator = this.unscaled * pow10(o.scale + target);
    const divisor = o.unscaled * pow10(this.scale);
    return new Decimal(divideRounded(numerator, divisor, rounding), target);
  }

  negate(): Decimal {
    return new Decimal(-this.unscaled, this.scale);
  }

  abs(): Decimal {
    return this.unscaled < 0n ? this.negate() : this;
  }

  /** Rounds to `scale` decimal digits with a midpoint mode (`toEven` by default); a larger scale appends zeros. */
  round(scale: number, mode: MidpointRounding = "toEven"): Decimal {
    if (scale < 0) throw new RangeError(`Decimal round scale must be ≥ 0, got ${scale}.`);
    if (scale >= this.scale) return new Decimal(this.unscaled * pow10(scale - this.scale), scale);
    return new Decimal(divideRounded(this.unscaled, pow10(this.scale - scale), mode), scale);
  }

  /** `-1 | 0 | 1` by value, scale-aligned (so `19.90` and `19.9` compare equal). */
  compare(other: Decimal | string | number | bigint): number {
    const o = Decimal.coerce(other);
    const scale = Math.max(this.scale, o.scale);
    const a = this.unscaled * pow10(scale - this.scale);
    const b = o.unscaled * pow10(scale - o.scale);
    return a < b ? -1 : a > b ? 1 : 0;
  }

  /** Value equality (scale-aligned): `Decimal.from("19.90").equals("19.9")` is true, as .NET's `decimal`. */
  equals(other: Decimal | string | number | bigint): boolean {
    return this.compare(other) === 0;
  }

  /** The value as a `number` (approximate beyond ~15 significant digits). */
  toNumber(): number {
    return Number(this.unscaled) / Number(pow10(this.scale));
  }

  /** The invariant fixed string with exactly `scale` decimals: `"19.90"`, `"-0.50"`. */
  toString(): string {
    const negative = this.unscaled < 0n;
    const digits = (negative ? -this.unscaled : this.unscaled).toString();
    if (this.scale === 0) return negative ? `-${digits}` : digits;
    const padded = digits.padStart(this.scale + 1, "0");
    const integral = padded.slice(0, -this.scale);
    const fraction = padded.slice(-this.scale);
    return `${negative ? "-" : ""}${integral}.${fraction}`;
  }

  /** Formats through `Intl.NumberFormat` (grouping, separators, currency). See the header's precision note. */
  format(locale?: string, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(locale, options).format(this.toNumber());
  }

  /** The string wire format: `JSON.stringify({ amount: Decimal.from("19.99") })` → `{"amount":"19.99"}`. */
  toJSON(): string {
    return this.toString();
  }
}
