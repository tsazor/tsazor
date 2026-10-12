/**
 * The calendar's dates (Fluent UI Blazor's FluentCalendar and FluentDatePicker, MudBlazor's MudDatePicker): a date is
 * ISO text without a time or a time zone, `"2026-10-10"` (.NET's DateOnly in JSON, the value of an
 * `input type="date"`), so no time zone can shift the day. ISO dates compare as text: `a < b` is "a is earlier".
 * Names and formats come from Intl for a locale.
 */

import { englishLibraryTexts, type LibraryTexts } from "./library-texts.js";

/** A date as ISO text, `"2026-10-10"`. */
export type IsoDate = string;

/** What a calendar shows and picks: days, months or years (Fluent UI Blazor's `CalendarViews`). */
export type CalendarView = "days" | "months" | "years";

/** How a calendar selects (`CalendarSelectMode`): one date, several, or a range. */
export type CalendarSelectMode = "single" | "multiple" | "range";

/** A range being picked: its start, and its end once a second date is picked (both inclusive). */
export interface DateRange {
  readonly start?: IsoDate;
  readonly end?: IsoDate;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The year, month (1–12) and day of an ISO date; undefined for text that is no real date ("2026-02-30"). */
export function parseIsoDate(text: string | null | undefined): { year: number; month: number; day: number } | undefined {
  const match = ISO.exec(text ?? "");
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  return { year, month, day };
}

/** Midnight UTC of a year, month (1–12) and day (setUTCFullYear: the years 0–99 stay themselves). */
function utc(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date;
}

/** The ISO date of a year, month (1–12) and day; days and months beyond their ends carry over (Jan 32 is Feb 1). */
export function isoDate(year: number, month: number, day: number): IsoDate {
  return utc(year, month, day).toISOString().slice(0, 10);
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The days of a month (month 1–12). */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return MONTH_DAYS[month - 1]!;
}

function parts(date: IsoDate): { year: number; month: number; day: number } {
  const parsed = parseIsoDate(date);
  if (parsed === undefined) throw new RangeError(`Not an ISO date: "${date}"`);
  return parsed;
}

/** `date` moved by `days` (negative: back). */
export function addDays(date: IsoDate, days: number): IsoDate {
  const { year, month, day } = parts(date);
  return isoDate(year, month, day + days);
}

/** `date` moved by `months`; a day the month doesn't have becomes its last (Jan 31 + 1 month is Feb 28). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parts(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  return isoDate(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** `date` moved by `years` (Feb 29 becomes Feb 28 in a common year). */
export function addYears(date: IsoDate, years: number): IsoDate {
  return addMonths(date, years * 12);
}

/** The day of the week, 0 (Sunday) to 6 (Saturday), as `Date.getDay()`. */
export function dayOfWeek(date: IsoDate): number {
  const { year, month, day } = parts(date);
  return utc(year, month, day).getUTCDay();
}

/** The first day of `date`'s month. */
export function startOfMonth(date: IsoDate): IsoDate {
  return `${date.slice(0, 8)}01`;
}

/** The first day of `date`'s week, for weeks that start on `firstDayOfWeek` (0 Sunday … 6 Saturday). */
export function startOfWeek(date: IsoDate, firstDayOfWeek: number): IsoDate {
  return addDays(date, -((dayOfWeek(date) - firstDayOfWeek + 7) % 7));
}

/** The locale a calendar uses when none is given: the page's `lang`, else the browser's language. */
export function pageLocale(): string {
  if (typeof document !== "undefined" && document.documentElement.lang) return document.documentElement.lang;
  if (typeof navigator !== "undefined" && navigator.language) return navigator.language;
  return "en-US";
}

/** Today in the browser's time zone. */
export function today(now: Date = new Date()): IsoDate {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** `date` inside `min` and `max` (either may be missing). */
export function clampDate(date: IsoDate, min?: IsoDate | null, max?: IsoDate | null): IsoDate {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/**
 * The six weeks a month view shows (Fluent UI Blazor's and MudBlazor's calendars keep six, so the grid never jumps):
 * from the start of the week of the 1st, seven days a row.
 */
export function calendarWeeks(month: IsoDate, firstDayOfWeek: number): IsoDate[][] {
  let day = startOfWeek(startOfMonth(month), firstDayOfWeek);
  const weeks: IsoDate[][] = [];
  for (let row = 0; row < 6; row++) {
    const week: IsoDate[] = [];
    for (let column = 0; column < 7; column++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** The twelve years a year view shows, from a year that 12 divides: 2016–2027 for 2026. */
export function calendarYears(date: IsoDate): number[] {
  const year = parts(date).year;
  const first = year - (((year % 12) + 12) % 12);
  return Array.from({ length: 12 }, (_, index) => first + index);
}

/** Regions whose weeks start on Sunday or Saturday, when Intl has no week info (CLDR's firstDay). */
const SUNDAY = new Set(["AG", "AS", "BD", "BR", "BS", "BT", "BW", "BZ", "CA", "CN", "CO", "DM", "DO", "ET", "GT", "GU", "HK",
  "HN", "ID", "IL", "IN", "JM", "JP", "KE", "KH", "KR", "LA", "MH", "MM", "MO", "MT", "MX", "MZ", "NI", "NP", "PA", "PE",
  "PH", "PK", "PR", "PT", "PY", "SA", "SG", "SV", "TH", "TT", "TW", "UM", "US", "VE", "VI", "WS", "YE", "ZA", "ZW"]);
const SATURDAY = new Set(["AE", "AF", "BH", "DJ", "DZ", "EG", "IQ", "IR", "JO", "KW", "LY", "OM", "QA", "SD", "SY"]);

/** The day a week starts on in `locale`, 0 (Sunday) … 6 (Saturday): Monday in "de-DE", Sunday in "en-US". */
export function firstDayOfWeek(locale: string): number {
  try {
    const value = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const info = value.getWeekInfo?.() ?? value.weekInfo;
    if (info !== undefined) return info.firstDay % 7;
    const region = value.maximize().region ?? "";
    return SUNDAY.has(region) ? 0 : SATURDAY.has(region) ? 6 : 1;
  } catch {
    return 1;
  }
}

/** Formats an ISO date for `locale` (in UTC, so the day is the date's own). */
export function formatIsoDate(date: IsoDate, locale: string, options: Intl.DateTimeFormatOptions): string {
  const { year, month, day } = parts(date);
  return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(utc(year, month, day));
}

/** The names of the weekdays from `firstDay` on: ["Mo", "Di", …] for "de-DE" and "short"… */
export function weekdayNames(locale: string, firstDay: number, width: "narrow" | "short" | "long"): string[] {
  // 2023-01-01 was a Sunday.
  return Array.from({ length: 7 }, (_, index) => formatIsoDate(isoDate(2023, 1, 1 + ((firstDay + index) % 7)), locale, { weekday: width }));
}

/** The names of the months, January first. */
export function monthNames(locale: string, width: "narrow" | "short" | "long"): string[] {
  return Array.from({ length: 12 }, (_, index) => formatIsoDate(isoDate(2023, index + 1, 1), locale, { month: width }));
}

/** The order of a locale's numeric date fields and the separator between them: de-DE is day, month, year and ".". */
function dateFieldPattern(locale: string): { order: ("day" | "month" | "year")[]; separator: string } {
  const formatted = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" })
    .formatToParts(new Date(Date.UTC(2023, 10, 22)));
  const order = formatted.filter((part) => part.type === "day" || part.type === "month" || part.type === "year")
    .map((part) => part.type as "day" | "month" | "year");
  const separator = formatted.find((part) => part.type === "literal")?.value ?? "/";
  return { order, separator };
}

/** The date as a date field shows it in `locale`: "10/10/2026" (en-US), "10.10.2026" (de-DE), "2026-10-10" (sv-SE). */
export function formatDateField(date: IsoDate, locale: string): string {
  return formatIsoDate(date, locale, { year: "numeric", month: "2-digit", day: "2-digit" });
}

/**
 * The ISO date of what someone typed into a date field: the locale's order ("10.10.2026", "1.2.26" in de-DE), or
 * ISO ("2026-10-10") in any locale. Two-digit years are 20xx. Undefined for text that is no date.
 */
export function parseDateField(text: string, locale: string): IsoDate | undefined {
  const trimmed = text.trim();
  if (parseIsoDate(trimmed) !== undefined) return trimmed;
  const numbers = trimmed.split(/[^\d]+/).filter((piece) => piece.length > 0);
  if (numbers.length !== 3) return undefined;
  const { order } = dateFieldPattern(locale);
  const field = (name: "day" | "month" | "year"): number => Number(numbers[order.indexOf(name)]);
  let year = field("year");
  if (numbers[order.indexOf("year")]!.length <= 2) year += 2000;
  const month = field("month");
  const day = field("day");
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;
  return isoDate(year, month, day);
}

/**
 * A date field's placeholder for `locale`: "MM/DD/YYYY" (en-US), "DD.MM.YYYY" (de-DE). The letters are library texts
 * (`tsazor.ui.dateField.*`): a German table makes it "TT.MM.JJJJ".
 */
export function dateFieldPlaceholder(locale: string, t: LibraryTexts = englishLibraryTexts): string {
  const { order, separator } = dateFieldPattern(locale);
  return order.map((name) => t(name === "year" ? "dateField.year" : name === "month" ? "dateField.month" : "dateField.day")).join(separator);
}

/**
 * Where a key moves the focused day of a calendar grid (the WAI-ARIA date picker pattern): the arrows by a day or a
 * week (left and right swapped in a right-to-left page), Home and End to the week's ends, Page Up and Page Down by a
 * month, with Shift by a year. Undefined for any other key.
 */
export function calendarKeyTarget(
  date: IsoDate,
  key: { key: string; shiftKey?: boolean },
  firstDay: number,
  rtl = false,
): IsoDate | undefined {
  switch (key.key) {
    case "ArrowLeft": return addDays(date, rtl ? 1 : -1);
    case "ArrowRight": return addDays(date, rtl ? -1 : 1);
    case "ArrowUp": return addDays(date, -7);
    case "ArrowDown": return addDays(date, 7);
    case "Home": return startOfWeek(date, firstDay);
    case "End": return addDays(startOfWeek(date, firstDay), 6);
    case "PageUp": return key.shiftKey ? addYears(date, -1) : addMonths(date, -1);
    case "PageDown": return key.shiftKey ? addYears(date, 1) : addMonths(date, 1);
    default: return undefined;
  }
}

/** The range a click makes (Fluent UI Blazor's range mode): a start, then its end; a click inside the range clears it. */
export function nextDateRange(range: DateRange, clicked: IsoDate, hover?: (date: IsoDate) => IsoDate[]): DateRange {
  const { start, end } = range;
  if (start !== undefined && clicked >= start && clicked <= (end ?? start)) return {};
  if (start !== undefined && end === undefined) return clicked < start ? { start: clicked, end: start } : { start, end: clicked };
  if (hover !== undefined) {
    const days = [...hover(clicked)].sort();
    return days.length === 0 ? {} : { start: days[0], end: days[days.length - 1] };
  }
  return { start: clicked };
}

/** Every day of a range, start to end; only the start while the end is missing. */
export function datesOfRange(range: DateRange): IsoDate[] {
  if (range.start === undefined) return [];
  const days: IsoDate[] = [];
  for (let day = range.start; day <= (range.end ?? range.start); day = addDays(day, 1)) days.push(day);
  return days;
}

/** The range that selected dates make: none, a started one (one date), or the first to the last. */
export function rangeOfDates(dates: readonly IsoDate[]): DateRange {
  if (dates.length === 0) return {};
  const sorted = [...dates].sort();
  return sorted.length === 1 ? { start: sorted[0] } : { start: sorted[0], end: sorted[sorted.length - 1] };
}

/** The dates a click makes in multiple mode: it toggles the date, or with `hover` selects what that gives. */
export function nextMultipleDates(selected: readonly IsoDate[], clicked: IsoDate, hover?: (date: IsoDate) => IsoDate[]): IsoDate[] {
  if (hover !== undefined) return [...hover(clicked)].sort();
  return selected.includes(clicked) ? selected.filter((date) => date !== clicked) : [...selected, clicked].sort();
}

/** A day as a calendar draws it (Fluent UI Blazor's FluentCalendarDay), for a `daysTemplate`. */
export interface CalendarDay {
  /** The day's ISO date. */
  readonly date: IsoDate;
  /** The day of the month as the calendar writes it ("7", or "07" with dayFormat 2-digit). */
  readonly dayNumber: string;
  /** The whole date, for screen readers: "Saturday, October 10, 2026". */
  readonly title: string;
  readonly isToday: boolean;
  readonly isSelected: boolean;
  /** Before minDate, after maxDate, or disabledDateFunc says so. */
  readonly isDisabled: boolean;
  /** A day of the month before or after the one shown. */
  readonly isInactive: boolean;
}

/** The texts of a calendar's buttons (English by default; Fluent UI Blazor localizes them). */
export interface CalendarLabels {
  readonly previousMonth: string;
  readonly nextMonth: string;
  readonly previousYear: string;
  readonly nextYear: string;
  readonly previousYears: string;
  readonly nextYears: string;
}

/** The calendar's texts from the library texts (`tsazor.ui.calendar.*`): `{ ...calendarLabelsFrom(t), ...labels }`. */
export function calendarLabelsFrom(t: LibraryTexts): CalendarLabels {
  return {
    previousMonth: t("calendar.previousMonth"),
    nextMonth: t("calendar.nextMonth"),
    previousYear: t("calendar.previousYear"),
    nextYear: t("calendar.nextYear"),
    previousYears: t("calendar.previousYears"),
    nextYears: t("calendar.nextYears"),
  };
}

/** The calendar's default texts, in English. */
export const calendarLabels: CalendarLabels = calendarLabelsFrom(englishLibraryTexts);

/** What keeps a date from being picked: before minDate, after maxDate, or disabledDateFunc. */
export interface DateLimits {
  readonly minDate?: IsoDate | null;
  readonly maxDate?: IsoDate | null;
  readonly disabledDateFunc?: (date: IsoDate) => boolean;
}

/** The date can't be picked. */
export function isDateDisabled(date: IsoDate, limits: DateLimits): boolean {
  if (limits.minDate && date < limits.minDate) return true;
  if (limits.maxDate && date > limits.maxDate) return true;
  return limits.disabledDateFunc?.(date) ?? false;
}

/** The days from `first` to `last` can't be picked: all lie outside min and max, or the function rules out the first
 * (with `checkAll`: every one). */
function daysDisabled(first: IsoDate, last: IsoDate, limits: DateLimits, checkAll: boolean): boolean {
  if ((limits.maxDate && first > limits.maxDate) || (limits.minDate && last < limits.minDate)) return true;
  if (limits.disabledDateFunc === undefined) return false;
  if (!checkAll) return limits.disabledDateFunc(first);
  for (let day = first; day <= last; day = addDays(day, 1)) if (!isDateDisabled(day, limits)) return false;
  return true;
}

/**
 * A month can't be picked: it lies before minDate or after maxDate, or disabledDateFunc rules out its first day — or,
 * with `checkAllDays` (`DisabledCheckAllDaysOfMonthYear`), every day.
 */
export function isMonthDisabled(year: number, month: number, limits: DateLimits, checkAllDays = false): boolean {
  return daysDisabled(isoDate(year, month, 1), isoDate(year, month, daysInMonth(year, month)), limits, checkAllDays);
}

/** A year can't be picked, as a month can't (`isMonthDisabled`). */
export function isYearDisabled(year: number, limits: DateLimits, checkAllDays = false): boolean {
  return daysDisabled(isoDate(year, 1, 1), isoDate(year, 12, 31), limits, checkAllDays);
}

/** A date picker's text for its value: the date field ("10/10/2026"), the month ("October 2026") or the year. */
export function formatPickerValue(value: IsoDate, view: CalendarView, locale: string): string {
  if (parseIsoDate(value) === undefined) return value;
  if (view === "years") return value.slice(0, 4);
  if (view === "months") return formatIsoDate(value, locale, { year: "numeric", month: "long" });
  return formatDateField(value, locale);
}

/** Lower case, without the punctuation around it ("Okt." is "okt"). */
function bare(text: string, locale: string): string {
  return text.toLocaleLowerCase(locale).replace(/^[\s.,/-]+|[\s.,/-]+$/g, "");
}

/**
 * The value of what someone typed into a date picker: for days a date in the locale's order or ISO; for months a
 * month and a year ("10/2026", "2026-10", "October 2026", "Okt. 2026"), its first day; for years a year, its January 1.
 */
export function parsePickerValue(text: string, view: CalendarView, locale: string): IsoDate | undefined {
  const trimmed = text.trim();
  if (view === "days") return parseDateField(trimmed, locale);
  const iso = /^(\d{4})(?:-(\d{2})(?:-\d{2})?)?$/.exec(trimmed);
  if (view === "years") return iso === null ? undefined : isoDate(Number(iso[1]), 1, 1);
  let year: number;
  let month: number;
  if (iso?.[2] !== undefined) {
    year = Number(iso[1]);
    month = Number(iso[2]);
  } else {
    // A month's number or name beside the year.
    const found = /\d{4}/.exec(trimmed);
    if (found === null) return undefined;
    year = Number(found[0]);
    const rest = bare(trimmed.replace(found[0], " "), locale);
    const named = (width: "long" | "short") => monthNames(locale, width).findIndex((name) => bare(name, locale) === rest) + 1;
    month = /^\d{1,2}$/.test(rest) ? Number(rest) : named("long") || named("short");
  }
  return month >= 1 && month <= 12 ? isoDate(year, month, 1) : undefined;
}
