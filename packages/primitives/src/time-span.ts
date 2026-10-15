/**
 * `TimeSpan` — a duration, .NET's `System.TimeSpan`: an elapsed interval, not a
 * clock position. Stored as whole milliseconds (negative allowed), so
 * `compare`/`equals` are exact; `fromSeconds(1.5)` rounds to the nearest
 * millisecond.
 *
 * It parses both ISO 8601 durations (`P3DT4H5M6S`) and .NET's `"c"` format
 * (`"1.02:03:04"` = 1 day, 2:03:04). `toString()`/`toJSON()` render `"c"`,
 * which is what ASP.NET Core writes for a `TimeSpan` by default, so the wire
 * round-trips.
 */
const MILLISECOND = 1;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** The `"c"` format: `[-][d.]hh:mm:ss[.fffffff]` (the fraction truncated to milliseconds). */
function parseConstantFormat(text: string): TimeSpan | null {
  const match = /^([+-])?(?:(\d+)\.)?(\d+):(\d{2}):(\d{2})(?:\.(\d{1,7}))?$/.exec(text);
  if (match === null) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const days = match[2] === undefined ? 0 : Number(match[2]);
  const hours = Number(match[3]);
  const minutes = Number(match[4]);
  const seconds = Number(match[5]);
  const fraction = match[6] === undefined ? 0 : Number(match[6].slice(0, 3).padEnd(3, "0"));
  if (minutes > 59 || seconds > 59) return null;
  return new TimeSpan(sign * ((((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000 + fraction));
}

/** ISO 8601 duration `[-]P[nD][T[nH][nM][nS]]` (fractional components allowed; no years/months — a TimeSpan has none). */
function parseIsoDuration(text: string): TimeSpan | null {
  const match = /^([+-])?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(text);
  if (match === null) return null;
  if (match[2] === undefined && match[3] === undefined && match[4] === undefined && match[5] === undefined) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const days = match[2] === undefined ? 0 : Number(match[2]);
  const hours = match[3] === undefined ? 0 : Number(match[3]);
  const minutes = match[4] === undefined ? 0 : Number(match[4]);
  const seconds = match[5] === undefined ? 0 : Number(match[5]);
  return new TimeSpan(sign * Math.round(days * DAY + hours * HOUR + minutes * MINUTE + seconds * SECOND));
}

export class TimeSpan {
  /** Whole milliseconds (negative allowed). */
  readonly totalMilliseconds: number;

  /** `new TimeSpan(90_000)` — the value is milliseconds. Prefer the `from*` helpers for readability. */
  constructor(totalMilliseconds: number) {
    if (!Number.isFinite(totalMilliseconds)) throw new RangeError(`TimeSpan must be a finite number of milliseconds, got ${totalMilliseconds}.`);
    this.totalMilliseconds = Math.round(totalMilliseconds);
  }

  static fromMilliseconds(milliseconds: number): TimeSpan {
    return new TimeSpan(milliseconds);
  }

  static fromSeconds(seconds: number): TimeSpan {
    return new TimeSpan(seconds * SECOND);
  }

  static fromMinutes(minutes: number): TimeSpan {
    return new TimeSpan(minutes * MINUTE);
  }

  static fromHours(hours: number): TimeSpan {
    return new TimeSpan(hours * HOUR);
  }

  static fromDays(days: number): TimeSpan {
    return new TimeSpan(days * DAY);
  }

  /** Parses an ISO 8601 duration or .NET's `"c"` format. Null on anything else. */
  static parse(text: string): TimeSpan | null {
    const trimmed = text.trim();
    if (trimmed === "") return null;
    return /^[+-]?P/i.test(trimmed) ? parseIsoDuration(trimmed) : parseConstantFormat(trimmed);
  }

  get totalSeconds(): number {
    return this.totalMilliseconds / SECOND;
  }

  get totalMinutes(): number {
    return this.totalMilliseconds / MINUTE;
  }

  get totalHours(): number {
    return this.totalMilliseconds / HOUR;
  }

  get totalDays(): number {
    return this.totalMilliseconds / DAY;
  }

  add(other: TimeSpan): TimeSpan {
    return new TimeSpan(this.totalMilliseconds + other.totalMilliseconds);
  }

  sub(other: TimeSpan): TimeSpan {
    return new TimeSpan(this.totalMilliseconds - other.totalMilliseconds);
  }

  negate(): TimeSpan {
    return new TimeSpan(-this.totalMilliseconds);
  }

  equals(other: TimeSpan): boolean {
    return this.totalMilliseconds === other.totalMilliseconds;
  }

  compare(other: TimeSpan): number {
    return this.totalMilliseconds - other.totalMilliseconds;
  }

  /** .NET's `"c"` format: `[-][d.]hh:mm:ss[.fff]`. */
  toString(): string {
    const negative = this.totalMilliseconds < 0;
    let remaining = Math.abs(this.totalMilliseconds);
    const days = Math.floor(remaining / DAY);
    remaining -= days * DAY;
    const hours = Math.floor(remaining / HOUR);
    remaining -= hours * HOUR;
    const minutes = Math.floor(remaining / MINUTE);
    remaining -= minutes * MINUTE;
    const seconds = Math.floor(remaining / SECOND);
    const millis = remaining - seconds * SECOND;
    const clock = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
    const fraction = millis > 0 ? `.${String(millis).padStart(3, "0")}` : "";
    const body = days > 0 ? `${days}.${clock}` : clock;
    return `${negative ? "-" : ""}${body}${fraction}`;
  }

  /** ISO 8601 duration (`P3DT4H5M6S`). */
  toISOString(): string {
    const negative = this.totalMilliseconds < 0;
    let remaining = Math.abs(this.totalMilliseconds);
    const days = Math.floor(remaining / DAY);
    remaining -= days * DAY;
    const hours = Math.floor(remaining / HOUR);
    remaining -= hours * HOUR;
    const minutes = Math.floor(remaining / MINUTE);
    remaining -= minutes * MINUTE;
    const seconds = remaining / SECOND;
    const sign = negative ? "-" : "";
    let out = `${sign}P`;
    if (days > 0) out += `${days}D`;
    const time: string[] = [];
    if (hours > 0) time.push(`${hours}H`);
    if (minutes > 0) time.push(`${minutes}M`);
    if (seconds > 0) time.push(`${seconds}S`);
    return time.length === 0 ? `${sign}PT0S` : `${out}T${time.join("")}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
