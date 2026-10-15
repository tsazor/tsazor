/**
 * `TimeOnly` — a time of day with no date and no time zone, .NET's
 * `System.TimeOnly`: a shop's opening hour, a meeting's start, a value that is
 * the same wall-clock time wherever it is read. Stored as milliseconds since
 * midnight (0…86,399,999), so `compare`/`equals` are trivial and the components
 * derive from one number.
 *
 * The ISO `HH:mm:ss[.fff]` string is the wire format (`toJSON`).
 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export class TimeOnly {
  /** Milliseconds since midnight (0…86,399,999). */
  readonly millisecondsOfDay: number;

  /** `new TimeOnly(14, 30)` — hour 0–23, minute/second 0–59, millisecond 0–999. */
  constructor(hour: number, minute: number, second = 0, millisecond = 0) {
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || !Number.isInteger(second) || !Number.isInteger(millisecond)) {
      throw new RangeError(`TimeOnly components must be integers: ${hour}:${minute}:${second}.${millisecond}.`);
    }
    if (hour < 0 || hour > 23) throw new RangeError(`TimeOnly hour must be 0–23, got ${hour}.`);
    if (minute < 0 || minute > 59) throw new RangeError(`TimeOnly minute must be 0–59, got ${minute}.`);
    if (second < 0 || second > 59) throw new RangeError(`TimeOnly second must be 0–59, got ${second}.`);
    if (millisecond < 0 || millisecond > 999) throw new RangeError(`TimeOnly millisecond must be 0–999, got ${millisecond}.`);
    this.millisecondsOfDay = ((hour * 60 + minute) * 60 + second) * 1000 + millisecond;
  }

  /** Parses `HH:mm`, `HH:mm:ss` or `HH:mm:ss.fff`. Null on any other shape or an out-of-range component. */
  static parse(text: string): TimeOnly | null {
    const match = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(text.trim());
    if (match === null) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = match[3] === undefined ? 0 : Number(match[3]);
    const millisecond = match[4] === undefined ? 0 : Number(match[4].padEnd(3, "0"));
    if (hour > 23 || minute > 59 || second > 59) return null;
    return new TimeOnly(hour, minute, second, millisecond);
  }

  get hour(): number {
    return Math.floor(this.millisecondsOfDay / 3_600_000);
  }

  get minute(): number {
    return Math.floor(this.millisecondsOfDay / 60_000) % 60;
  }

  get second(): number {
    return Math.floor(this.millisecondsOfDay / 1000) % 60;
  }

  get millisecond(): number {
    return this.millisecondsOfDay % 1000;
  }

  equals(other: TimeOnly): boolean {
    return this.millisecondsOfDay === other.millisecondsOfDay;
  }

  compare(other: TimeOnly): number {
    return this.millisecondsOfDay - other.millisecondsOfDay;
  }

  /** `HH:mm:ss`, plus `.fff` when there are milliseconds. */
  toString(): string {
    const base = `${pad2(this.hour)}:${pad2(this.minute)}:${pad2(this.second)}`;
    return this.millisecond === 0 ? base : `${base}.${String(this.millisecond).padStart(3, "0")}`;
  }

  toJSON(): string {
    return this.toString();
  }
}
