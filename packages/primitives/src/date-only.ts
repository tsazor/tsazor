/**
 * `DateOnly` — a calendar date with no time and no time zone, .NET's
 * `System.DateOnly`. `Date` forces a time and an epoch offset onto values that
 * have neither, so a birthday or a contract date read back a day early after a
 * round-trip through UTC. `DateOnly` holds just `year`/`month`/`day`.
 *
 * The ISO `yyyy-MM-dd` string is the wire format (`toJSON`); `@tsazor/dotnet`
 * maps OpenAPI `format: date` to it. When `Temporal` lands broadly this type can
 * map onto `Temporal.PlainDate`.
 */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export class DateOnly {
  readonly year: number;
  readonly month: number;
  readonly day: number;

  /** `new DateOnly(2026, 1, 31)` — the components are validated (the month 1–12, the day of the month). */
  constructor(year: number, month: number, day: number) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
      throw new RangeError(`DateOnly components must be integers: ${year}-${month}-${day}.`);
    }
    if (month < 1 || month > 12) throw new RangeError(`DateOnly month must be 1–12, got ${month}.`);
    if (day < 1 || day > daysInMonth(year, month)) throw new RangeError(`DateOnly day ${day} is out of range for ${year}-${month}.`);
    this.year = year;
    this.month = month;
    this.day = day;
  }

  /** Today in the local time zone. */
  static today(): DateOnly {
    const now = new Date();
    return new DateOnly(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  /** Parses ISO `yyyy-MM-dd`. Null on any other shape. */
  static parse(text: string): DateOnly | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
    if (match === null) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    return new DateOnly(year, month, day);
  }

  /** This date plus a whole number of days (negative subtracts). */
  addDays(days: number): DateOnly {
    const millis = Date.UTC(this.year, this.month - 1, this.day) + days * 86_400_000;
    const d = new Date(millis);
    return new DateOnly(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  equals(other: DateOnly): boolean {
    return this.year === other.year && this.month === other.month && this.day === other.day;
  }

  /** `-1 | 0 | 1` chronologically. */
  compare(other: DateOnly): number {
    return this.year - other.year || this.month - other.month || this.day - other.day;
  }

  /** ISO `yyyy-MM-dd`. */
  toString(): string {
    return `${String(this.year).padStart(4, "0")}-${String(this.month).padStart(2, "0")}-${String(this.day).padStart(2, "0")}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
