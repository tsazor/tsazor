/**
 * .NET's date and time format strings for `@bind:format` (Blazor's BindConverter uses DateTime.ToString and
 * TryParseExact): the custom specifiers (`yyyy`, `MMMM`, `dddd`, `hh`, `tt`, `fff`, `K`, `zzz`, quoted
 * literals, `\` escapes, `%`) and the standard one-letter formats (`d`, `D`, `f`, `F`, `g`, `G`, `M`, `o`,
 * `R`, `s`, `t`, `T`, `u`, `U`, `Y`), in the invariant culture: English names, `/` and `:` as separators.
 * A JavaScript Date is local; `K` and `z` write the local offset, and `R`, `u` and `U` write UTC, as .NET
 * does for a local DateTime.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The invariant culture's patterns for the standard formats; `utc`: written in UTC. */
const STANDARD: Readonly<Record<string, { pattern: string; utc?: boolean }>> = {
  d: { pattern: "MM/dd/yyyy" },
  D: { pattern: "dddd, dd MMMM yyyy" },
  f: { pattern: "dddd, dd MMMM yyyy HH:mm" },
  F: { pattern: "dddd, dd MMMM yyyy HH:mm:ss" },
  g: { pattern: "MM/dd/yyyy HH:mm" },
  G: { pattern: "MM/dd/yyyy HH:mm:ss" },
  m: { pattern: "MMMM dd" },
  M: { pattern: "MMMM dd" },
  o: { pattern: "yyyy'-'MM'-'dd'T'HH':'mm':'ss.fffffffK" },
  O: { pattern: "yyyy'-'MM'-'dd'T'HH':'mm':'ss.fffffffK" },
  r: { pattern: "ddd, dd MMM yyyy HH':'mm':'ss 'GMT'", utc: true },
  R: { pattern: "ddd, dd MMM yyyy HH':'mm':'ss 'GMT'", utc: true },
  s: { pattern: "yyyy'-'MM'-'dd'T'HH':'mm':'ss" },
  t: { pattern: "HH:mm" },
  T: { pattern: "HH:mm:ss" },
  u: { pattern: "yyyy'-'MM'-'dd HH':'mm':'ss'Z'", utc: true },
  U: { pattern: "dddd, dd MMMM yyyy HH:mm:ss", utc: true },
  y: { pattern: "yyyy MMMM" },
  Y: { pattern: "yyyy MMMM" },
};

type Token = { kind: "literal"; text: string } | { kind: "field"; letter: string; count: number };

const FIELD_LETTERS = new Set(["d", "f", "F", "g", "h", "H", "K", "m", "M", "s", "t", "y", "z"]);

/** A format as a pattern: a one-letter format is a standard one; `%x` is the custom `x`. */
function patternOf(format: string): { pattern: string; utc: boolean } {
  const standard = format.length === 1 ? STANDARD[format] : undefined;
  if (standard !== undefined) return { pattern: standard.pattern, utc: standard.utc === true };
  return { pattern: format, utc: false };
}

function tokenize(pattern: string): Token[] {
  const tokens: Token[] = [];
  const literal = (text: string): void => {
    const last = tokens[tokens.length - 1];
    if (last?.kind === "literal") last.text += text;
    else tokens.push({ kind: "literal", text });
  };
  let i = 0;
  while (i < pattern.length) {
    const char = pattern[i]!;
    if (char === "'" || char === '"') {
      const end = pattern.indexOf(char, i + 1);
      literal(pattern.slice(i + 1, end === -1 ? pattern.length : end));
      i = end === -1 ? pattern.length : end + 1;
    } else if (char === "\\") {
      literal(pattern[i + 1] ?? "");
      i += 2;
    } else if (char === "%") {
      i++;
    } else if (char === "/" || char === ":") {
      literal(char);
      i++;
    } else if (FIELD_LETTERS.has(char)) {
      let count = 1;
      while (pattern[i + count] === char) count++;
      tokens.push({ kind: "field", letter: char, count });
      i += count;
    } else {
      literal(char);
      i++;
    }
  }
  return tokens;
}

const pad = (n: number, width: number): string => String(Math.abs(n)).padStart(width, "0");

function offsetText(minutes: number, count: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  if (count === 1) return `${sign}${hours}`;
  if (count === 2) return `${sign}${pad(hours, 2)}`;
  return `${sign}${pad(hours, 2)}:${pad(rest, 2)}`;
}

/** A Date in a .NET format (invariant culture); see the module comment. */
export function formatDateTime(date: Date, format: string): string {
  const { pattern, utc } = patternOf(format);
  const year = utc ? date.getUTCFullYear() : date.getFullYear();
  const month = utc ? date.getUTCMonth() : date.getMonth();
  const day = utc ? date.getUTCDate() : date.getDate();
  const weekday = utc ? date.getUTCDay() : date.getDay();
  const hours = utc ? date.getUTCHours() : date.getHours();
  const minutes = utc ? date.getUTCMinutes() : date.getMinutes();
  const seconds = utc ? date.getUTCSeconds() : date.getSeconds();
  const milliseconds = utc ? date.getUTCMilliseconds() : date.getMilliseconds();
  // .NET counts the offset east of UTC as positive; getTimezoneOffset is the other way round.
  const offset = -date.getTimezoneOffset();
  let result = "";
  for (const token of tokenize(pattern)) {
    if (token.kind === "literal") {
      result += token.text;
      continue;
    }
    const { letter, count } = token;
    switch (letter) {
      case "d":
        result += count === 1 ? String(day) : count === 2 ? pad(day, 2) : count === 3 ? DAYS[weekday]!.slice(0, 3) : DAYS[weekday]!;
        break;
      case "M":
        result += count === 1 ? String(month + 1) : count === 2 ? pad(month + 1, 2) : count === 3 ? MONTHS[month]!.slice(0, 3) : MONTHS[month]!;
        break;
      case "y":
        result += count === 1 ? String(year % 100) : count === 2 ? pad(year % 100, 2) : pad(year, count);
        break;
      case "h":
        result += count === 1 ? String(hours % 12 || 12) : pad(hours % 12 || 12, 2);
        break;
      case "H":
        result += count === 1 ? String(hours) : pad(hours, 2);
        break;
      case "m":
        result += count === 1 ? String(minutes) : pad(minutes, 2);
        break;
      case "s":
        result += count === 1 ? String(seconds) : pad(seconds, 2);
        break;
      case "f":
      case "F": {
        // JavaScript keeps milliseconds: the digits after them are zeros.
        const digits = pad(milliseconds, 3).padEnd(7, "0").slice(0, Math.min(count, 7));
        result += letter === "f" ? digits : digits.replace(/0+$/, "");
        break;
      }
      case "t":
        result += (hours < 12 ? "AM" : "PM").slice(0, count === 1 ? 1 : 2);
        break;
      case "g":
        result += "A.D.";
        break;
      case "K":
        result += utc ? "Z" : offsetText(offset, 3);
        break;
      case "z":
        result += offsetText(offset, count);
        break;
    }
  }
  return result;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Text in a .NET format as a Date (TryParseExact, invariant culture), or null when it doesn't match or
 * names a date that doesn't exist. With an offset (`K`, `z`) or a UTC format (`R`, `u`, `U`) the text
 * names an instant; otherwise it is local time.
 */
export function parseDateTime(text: string, format: string): Date | null {
  const { pattern, utc } = patternOf(format);
  let source = "^";
  const fields: Array<{ letter: string; count: number }> = [];
  for (const token of tokenize(pattern)) {
    if (token.kind === "literal") {
      source += escapeRegExp(token.text);
      continue;
    }
    const { letter, count } = token;
    const names = (list: readonly string[], short: boolean): string => list.map((name) => (short ? name.slice(0, 3) : name)).join("|");
    const group = ((): string | undefined => {
      switch (letter) {
        case "d":
          return count <= 2 ? (count === 1 ? "\\d{1,2}" : "\\d{2}") : names(DAYS, count === 3);
        case "M":
          return count <= 2 ? (count === 1 ? "\\d{1,2}" : "\\d{2}") : names(MONTHS, count === 3);
        case "y":
          return count === 1 ? "\\d{1,2}" : count === 2 ? "\\d{2}" : `\\d{${count},}`;
        case "h":
        case "H":
        case "m":
        case "s":
          return count === 1 ? "\\d{1,2}" : "\\d{2}";
        case "f":
          return `\\d{${Math.min(count, 7)}}`;
        case "F":
          return `\\d{0,${Math.min(count, 7)}}`;
        case "t":
          return count === 1 ? "A|P" : "AM|PM";
        case "g":
          return "A\\.D\\.|AD";
        case "K":
          return "Z|[+-]\\d{2}:\\d{2}|";
        case "z":
          return count === 1 ? "[+-]\\d{1,2}" : count === 2 ? "[+-]\\d{2}" : "[+-]\\d{2}:\\d{2}";
        default:
          return undefined;
      }
    })();
    if (group === undefined) continue;
    source += `(${group})`;
    fields.push({ letter, count });
  }
  const match = new RegExp(`${source}$`, "i").exec(text.trim());
  if (match === null) return null;

  let year = NaN;
  let month = 0;
  let day = 1;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  let milliseconds = 0;
  let pm: boolean | undefined;
  let twelveHour = false;
  let offset: number | undefined = utc ? 0 : undefined;
  const findIndex = (list: readonly string[], value: string, short: boolean): number =>
    list.findIndex((name) => (short ? name.slice(0, 3) : name).toLowerCase() === value.toLowerCase());
  fields.forEach(({ letter, count }, index) => {
    const value = match[index + 1]!;
    switch (letter) {
      case "d":
        if (count <= 2) day = Number(value);
        break;
      case "M":
        month = count <= 2 ? Number(value) - 1 : findIndex(MONTHS, value, count === 3);
        break;
      case "y":
        // .NET's TwoDigitYearMax is 2049: 00–49 is 20xx, 50–99 19xx.
        year = count <= 2 ? (Number(value) <= 49 ? 2000 : 1900) + Number(value) : Number(value);
        break;
      case "h":
        twelveHour = true;
        hours = Number(value) % 12;
        break;
      case "H":
        hours = Number(value);
        break;
      case "m":
        minutes = Number(value);
        break;
      case "s":
        seconds = Number(value);
        break;
      case "f":
      case "F":
        milliseconds = value === "" ? 0 : Math.round(Number(`0.${value}`) * 1000);
        break;
      case "t":
        pm = value.toUpperCase().startsWith("P");
        break;
      case "K":
      case "z": {
        if (value === "") break;
        if (value.toUpperCase() === "Z") {
          offset = 0;
          break;
        }
        const [h, m] = value.slice(1).split(":");
        offset = (value.startsWith("-") ? -1 : 1) * (Number(h) * 60 + Number(m ?? 0));
        break;
      }
    }
  });
  if (twelveHour && pm === true) hours += 12;
  // .NET: a format without a date element parses into today, one without a year into this year.
  const today = new Date();
  if (!fields.some((field) => field.letter === "y" || field.letter === "M" || field.letter === "d")) {
    [year, month, day] = [today.getFullYear(), today.getMonth(), today.getDate()];
  } else if (!fields.some((field) => field.letter === "y")) {
    year = today.getFullYear();
  }
  if (Number.isNaN(year)) return null;
  const date =
    offset === undefined
      ? new Date(year, month, day, hours, minutes, seconds, milliseconds)
      : new Date(Date.UTC(year, month, day, hours, minutes, seconds, milliseconds) - offset * 60_000);
  // The fields as written must survive the round trip (no month 13, no 31 February).
  const check = offset === undefined ? date : new Date(date.getTime() + offset * 60_000);
  const [checkYear, checkMonth, checkDay] =
    offset === undefined ? [check.getFullYear(), check.getMonth(), check.getDate()] : [check.getUTCFullYear(), check.getUTCMonth(), check.getUTCDate()];
  if (Number.isNaN(date.getTime()) || checkYear !== year || checkMonth !== month || checkDay !== day) return null;
  return date;
}
