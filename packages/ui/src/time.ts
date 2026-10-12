/**
 * Times of day for the time picker (Fluent UI Blazor's FluentTimePicker). The value is ISO text, "14:30:00" — what
 * .NET's System.Text.Json writes for a TimeOnly — so a model property stays a string and no time zone shifts it.
 * The field writes and reads the time as the locale does ("2:30 PM" in en-US, "14:30" in de-DE).
 */

import { englishLibraryTexts, type LibraryTexts } from "./library-texts.js";

/** A time of day as ISO text, "HH:mm:ss" ("14:30:00"); "HH:mm" is read too. */
export type IsoTime = string;

/** The hour cycle of a time field: 12 hours with AM and PM, or 24. Default: the locale's. */
export type HourCycle = "h12" | "h23";

const ISO_TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?$/;

/** The hours, minutes and seconds of an ISO time ("14:30", "14:30:00"), or undefined when the text is none. */
export function parseIsoTime(text: string): { hours: number; minutes: number; seconds: number } | undefined {
  const match = ISO_TIME.exec(text.trim());
  if (match === null) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return undefined;
  return { hours, minutes, seconds };
}

/** The ISO time of its parts: `isoTime(14, 30)` is "14:30:00". */
export function isoTime(hours: number, minutes: number, seconds = 0): IsoTime {
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${two(hours)}:${two(minutes)}:${two(seconds)}`;
}

/** An ISO time in its full form ("14:30" becomes "14:30:00"), or undefined when the text is none. */
export function normalizeIsoTime(text: string): IsoTime | undefined {
  const parts = parseIsoTime(text);
  return parts === undefined ? undefined : isoTime(parts.hours, parts.minutes, parts.seconds);
}

/**
 * The times a time picker lists (Fluent UI Blazor's `StartHour`, `EndHour`, `Increment`): from `startHour` (0–23)
 * to `endHour` (up to 24) every `increment` minutes (0 counts as 1), the end included unless it is midnight.
 */
export function timeOptions(startHour = 8, endHour = 18, increment = 15): IsoTime[] {
  const step = Math.max(1, Math.floor(increment));
  const start = Math.min(23, Math.max(0, Math.floor(startHour))) * 60;
  const end = Math.min(24, Math.max(0, Math.floor(endHour))) * 60;
  const total = Math.max(0, end - start);
  let count = Math.floor(total / step) + 1;
  if (end === 24 * 60 && total % step === 0) count--;
  return Array.from({ length: count }, (_, index) => {
    const minutes = start + index * step;
    return isoTime(Math.floor(minutes / 60), minutes % 60);
  });
}

/** The locale's short time pattern (.NET's ShortTimePattern: "h:mm tt" in en-US, "HH:mm" in de-DE), medium with seconds. */
function timeFormat(locale: string, hourCycle: HourCycle | undefined, seconds: boolean): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    timeStyle: seconds ? "medium" : "short",
    ...(hourCycle !== undefined ? { hourCycle } : {}),
    timeZone: "UTC",
  });
}

const atTime = (hours: number, minutes: number, seconds = 0): Date => new Date(Date.UTC(2000, 0, 1, hours, minutes, seconds));

/** The time as the locale writes it: "2:30 PM" (en-US), "14:30" (de-DE); seconds only when there are some. */
export function formatTimeField(time: IsoTime, locale: string, hourCycle?: HourCycle): string {
  const parts = parseIsoTime(time);
  if (parts === undefined) return time;
  return timeFormat(locale, hourCycle, parts.seconds !== 0).format(atTime(parts.hours, parts.minutes, parts.seconds));
}

/**
 * A time field's placeholder for `locale`: "hh:mm AM/PM" (en-US), "hh:mm" (de-DE). The letters are library texts
 * (`tsazor.ui.timeField.*`).
 */
export function timeFieldPlaceholder(locale: string, hourCycle?: HourCycle, t: LibraryTexts = englishLibraryTexts): string {
  const { am, pm } = dayPeriods(locale);
  return timeFormat(locale, hourCycle, false)
    .formatToParts(atTime(13, 30))
    .map((part) => (part.type === "hour" ? t("timeField.hour") : part.type === "minute" ? t("timeField.minute") : part.type === "dayPeriod" ? `${am}/${pm}` : part.value))
    .join("");
}

/** The locale's words for AM and PM ("AM"/"PM" in en-US, "vorm."/"nachm." where the locale says so). */
function dayPeriods(locale: string): { am: string; pm: string } {
  const format = new Intl.DateTimeFormat(locale, { hour: "numeric", hourCycle: "h12", timeZone: "UTC" });
  const periodAt = (hours: number): string => format.formatToParts(atTime(hours, 0)).find((part) => part.type === "dayPeriod")?.value ?? "";
  return { am: periodAt(1) || "AM", pm: periodAt(13) || "PM" };
}

/** Letters only, for comparing day periods: "p.m." and "PM" are both "pm" ("h" is a separator: "14h30"). */
const periodKey = (text: string): string => text.toLowerCase().replace(/[\d\s:.h]/g, "");

const CLOCK = /^(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?(?:\s*[:.]\s*(\d{2}))?\s*h?$/;
const COMPACT = /^(\d{3,4})$/;

/**
 * The ISO time of what someone typed into a time field: ISO ("14:30"), the locale's way ("2:30 PM", "14.30"), with
 * the locale's or the English AM and PM in any place ("2pm", "2:30 p.m."), "14h30", or the digits only ("930",
 * "1430"). Undefined for text that is no time.
 */
export function parseTimeField(text: string, locale: string): IsoTime | undefined {
  const trimmed = text.trim();
  const iso = normalizeIsoTime(trimmed);
  if (iso !== undefined) return iso;
  const marker = periodKey(trimmed);
  let period: "am" | "pm" | undefined;
  if (marker !== "") {
    const { am, pm } = dayPeriods(locale);
    if (marker === periodKey(am) || marker === "am" || marker === "a") period = "am";
    else if (marker === periodKey(pm) || marker === "pm" || marker === "p") period = "pm";
    else return undefined;
  }
  // What is left once the day period's letters are gone: the digits and their separators.
  const clock = trimmed.toLowerCase().replace(/[^\d\s:.h]/g, " ").replace(/^[\s:.]+|[\s:.]+$/g, "");
  let hours: number;
  let minutes = 0;
  let seconds = 0;
  const compact = COMPACT.exec(clock);
  const match = compact === null ? CLOCK.exec(clock) : null;
  if (compact !== null) {
    hours = Math.floor(Number(compact[1]) / 100);
    minutes = Number(compact[1]) % 100;
  } else if (match !== null) {
    hours = Number(match[1]);
    minutes = Number(match[2] ?? 0);
    seconds = Number(match[3] ?? 0);
  } else {
    return undefined;
  }
  if (minutes > 59 || seconds > 59) return undefined;
  if (period !== undefined) {
    if (hours < 1 || hours > 12) return undefined;
    hours = (hours % 12) + (period === "pm" ? 12 : 0);
  } else if (hours > 23) {
    return undefined;
  }
  return isoTime(hours, minutes, seconds);
}

/** The value as a time field writes it: the locale's way for an ISO time, anything else as it is (it was typed). */
export function formatTimePickerValue(value: string, locale: string, hourCycle?: HourCycle): string {
  return parseIsoTime(value) === undefined ? value : formatTimeField(value, locale, hourCycle);
}

/**
 * The option a time picker's list opens on: the value's, else the first one after it, else the first; a disabled
 * one hands over to the next enabled (`nextEnabledOption`). -1 when every option is disabled.
 */
export function initialTimeOption(options: readonly IsoTime[], value: string | undefined, disabled: readonly boolean[]): number {
  if (options.length === 0) return -1;
  const time = value === undefined ? undefined : normalizeIsoTime(value);
  let index = time === undefined ? 0 : options.findIndex((option) => option >= time);
  if (index < 0) index = 0;
  return disabled[index] ? nextEnabledOption(index, 1, disabled) : index;
}

/** The next enabled option from `from` by `step`, wrapping at the ends; -1 when none is enabled. */
export function nextEnabledOption(from: number, step: 1 | -1, disabled: readonly boolean[]): number {
  const count = disabled.length;
  for (let i = 1; i <= count; i++) {
    const index = (((from + step * i) % count) + count) % count;
    if (!disabled[index]) return index;
  }
  return -1;
}

/** The first (`step` 1) or the last (`step` -1) enabled option; -1 when none is. */
export function edgeEnabledOption(step: 1 | -1, disabled: readonly boolean[]): number {
  return nextEnabledOption(step === 1 ? -1 : disabled.length, step, disabled);
}
