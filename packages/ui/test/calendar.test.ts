import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addYears,
  calendarKeyTarget,
  calendarWeeks,
  calendarYears,
  clampDate,
  datesOfRange,
  dateFieldPlaceholder,
  dayOfWeek,
  daysInMonth,
  firstDayOfWeek,
  formatDateField,
  formatPickerValue,
  isDateDisabled,
  isMonthDisabled,
  isYearDisabled,
  isoDate,
  monthNames,
  nextDateRange,
  nextMultipleDates,
  parseDateField,
  parseIsoDate,
  parsePickerValue,
  rangeOfDates,
  startOfWeek,
  today,
  weekdayNames,
} from "../src/calendar.js";

describe("ISO dates", () => {
  it("parse only real dates", () => {
    expect(parseIsoDate("2026-10-10")).toEqual({ year: 2026, month: 10, day: 10 });
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseIsoDate("2026-02-29")).toBeUndefined();
    expect(parseIsoDate("2026-13-01")).toBeUndefined();
    expect(parseIsoDate("10.10.2026")).toBeUndefined();
    expect(parseIsoDate("")).toBeUndefined();
  });

  it("carry days and months over, and keep the years 0–99", () => {
    expect(isoDate(2026, 1, 32)).toBe("2026-02-01");
    expect(isoDate(2026, 13, 1)).toBe("2027-01-01");
    expect(isoDate(2026, 3, 0)).toBe("2026-02-28");
    expect(isoDate(42, 6, 1)).toBe("0042-06-01");
  });

  it("know their months' lengths and leap years", () => {
    expect([daysInMonth(2024, 2), daysInMonth(2026, 2), daysInMonth(1900, 2), daysInMonth(2000, 2)]).toEqual([29, 28, 28, 29]);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it("move by days, months and years; a missing day becomes the month's last", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
    expect(addMonths("2026-03-31", -13)).toBe("2025-02-28");
    expect(addYears("2024-02-29", 1)).toBe("2025-02-28");
  });

  it("weekdays, week starts and clamping", () => {
    expect(dayOfWeek("2026-10-10")).toBe(6);
    expect(startOfWeek("2026-10-10", 1)).toBe("2026-10-05");
    expect(startOfWeek("2026-10-10", 0)).toBe("2026-10-04");
    expect(startOfWeek("2026-10-04", 0)).toBe("2026-10-04");
    expect(clampDate("2026-10-10", "2026-11-01", null)).toBe("2026-11-01");
    expect(clampDate("2026-10-10", undefined, "2026-10-01")).toBe("2026-10-01");
    expect(clampDate("2026-10-10")).toBe("2026-10-10");
  });

  it("today is the local date", () => {
    expect(today(new Date(2026, 9, 10, 23, 59))).toBe("2026-10-10");
  });
});

describe("calendar views", () => {
  it("a month is six weeks from the start of the week of the 1st", () => {
    const weeks = calendarWeeks("2026-10-17", 1);
    expect(weeks).toHaveLength(6);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]![0]).toBe("2026-09-28");
    expect(weeks[0]![3]).toBe("2026-10-01");
    expect(weeks[5]![6]).toBe("2026-11-08");
    expect(calendarWeeks("2026-10-01", 0)[0]![0]).toBe("2026-09-27");
  });

  it("a year view is twelve years", () => {
    expect(calendarYears("2026-10-10")).toEqual([2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]);
    expect(calendarYears("2028-01-01")[0]).toBe(2028);
  });
});

describe("locales", () => {
  it("the week starts where the locale says", () => {
    expect(firstDayOfWeek("de-DE")).toBe(1);
    expect(firstDayOfWeek("en-US")).toBe(0);
    expect(firstDayOfWeek("en-GB")).toBe(1);
    expect(firstDayOfWeek("not a locale")).toBe(1);
  });

  it("names weekdays from the week's first day, and months", () => {
    expect(weekdayNames("en-US", 0, "short")).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(weekdayNames("de-DE", 1, "short")[0]).toBe("Mo");
    expect(monthNames("en-US", "long")[9]).toBe("October");
    expect(monthNames("de-DE", "long")[2]).toBe("März");
  });

  it("formats a date field as the locale writes dates", () => {
    expect(formatDateField("2026-10-09", "en-US")).toBe("10/09/2026");
    expect(formatDateField("2026-10-09", "de-DE")).toBe("09.10.2026");
    expect(dateFieldPlaceholder("en-US")).toBe("MM/DD/YYYY");
    expect(dateFieldPlaceholder("de-DE")).toBe("DD.MM.YYYY");
  });

  it("reads a typed date in the locale's order, or ISO; two-digit years are 20xx", () => {
    expect(parseDateField("10/9/2026", "en-US")).toBe("2026-10-09");
    expect(parseDateField("9.10.2026", "de-DE")).toBe("2026-10-09");
    expect(parseDateField("1.2.26", "de-DE")).toBe("2026-02-01");
    expect(parseDateField(" 2026-10-09 ", "de-DE")).toBe("2026-10-09");
    expect(parseDateField("31.02.2026", "de-DE")).toBeUndefined();
    expect(parseDateField("tomorrow", "en-US")).toBeUndefined();
    expect(parseDateField("10/2026", "en-US")).toBeUndefined();
  });
});

describe("calendarKeyTarget", () => {
  const key = (name: string, shiftKey = false) => ({ key: name, shiftKey });

  it("moves by days and weeks, to the week's ends, by months and years", () => {
    expect(calendarKeyTarget("2026-10-10", key("ArrowLeft"), 1)).toBe("2026-10-09");
    expect(calendarKeyTarget("2026-10-31", key("ArrowRight"), 1)).toBe("2026-11-01");
    expect(calendarKeyTarget("2026-10-10", key("ArrowUp"), 1)).toBe("2026-10-03");
    expect(calendarKeyTarget("2026-10-10", key("ArrowDown"), 1)).toBe("2026-10-17");
    expect(calendarKeyTarget("2026-10-10", key("Home"), 1)).toBe("2026-10-05");
    expect(calendarKeyTarget("2026-10-10", key("End"), 1)).toBe("2026-10-11");
    expect(calendarKeyTarget("2026-10-10", key("End"), 0)).toBe("2026-10-10");
    expect(calendarKeyTarget("2026-10-31", key("PageDown"), 1)).toBe("2026-11-30");
    expect(calendarKeyTarget("2026-10-10", key("PageUp", true), 1)).toBe("2025-10-10");
    expect(calendarKeyTarget("2026-10-10", key("Enter"), 1)).toBeUndefined();
  });

  it("swaps left and right in a right-to-left page", () => {
    expect(calendarKeyTarget("2026-10-10", key("ArrowLeft"), 6, true)).toBe("2026-10-11");
  });
});

describe("selections", () => {
  it("a range: a start, then its end (in either order); a click inside clears it", () => {
    expect(nextDateRange({}, "2026-10-10")).toEqual({ start: "2026-10-10" });
    expect(nextDateRange({ start: "2026-10-10" }, "2026-10-14")).toEqual({ start: "2026-10-10", end: "2026-10-14" });
    expect(nextDateRange({ start: "2026-10-10" }, "2026-10-07")).toEqual({ start: "2026-10-07", end: "2026-10-10" });
    expect(nextDateRange({ start: "2026-10-10", end: "2026-10-14" }, "2026-10-12")).toEqual({});
    expect(nextDateRange({ start: "2026-10-10", end: "2026-10-14" }, "2026-10-20")).toEqual({ start: "2026-10-20" });
    expect(nextDateRange({ start: "2026-10-10" }, "2026-10-10")).toEqual({});
  });

  it("a range from a hover function (a whole week)", () => {
    const week = (date: string) => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date, 1), index));
    expect(nextDateRange({}, "2026-10-10", week)).toEqual({ start: "2026-10-05", end: "2026-10-11" });
  });

  it("the days of a range, and the range of days", () => {
    expect(datesOfRange({ start: "2026-10-30", end: "2026-11-02" })).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(datesOfRange({ start: "2026-10-30" })).toEqual(["2026-10-30"]);
    expect(datesOfRange({})).toEqual([]);
    expect(rangeOfDates(["2026-10-12", "2026-10-10", "2026-10-11"])).toEqual({ start: "2026-10-10", end: "2026-10-12" });
    expect(rangeOfDates(["2026-10-12"])).toEqual({ start: "2026-10-12" });
    expect(rangeOfDates([])).toEqual({});
  });

  it("multiple: a click toggles a date", () => {
    expect(nextMultipleDates(["2026-10-12"], "2026-10-10")).toEqual(["2026-10-10", "2026-10-12"]);
    expect(nextMultipleDates(["2026-10-10", "2026-10-12"], "2026-10-10")).toEqual(["2026-10-12"]);
  });
});

describe("limits", () => {
  const sunday = (date: string) => dayOfWeek(date) === 0;
  const limits = { minDate: "2026-10-05", maxDate: "2026-12-20", disabledDateFunc: sunday };

  it("a day before min, after max or that the function rules out", () => {
    expect(isDateDisabled("2026-10-04", limits)).toBe(true);
    expect(isDateDisabled("2026-10-05", limits)).toBe(false);
    expect(isDateDisabled("2026-10-11", limits)).toBe(true);
    expect(isDateDisabled("2026-12-21", limits)).toBe(true);
    expect(isDateDisabled("2026-12-21", {})).toBe(false);
  });

  it("a month or a year outside min and max, or whose first day is ruled out (every day: checkAllDays)", () => {
    expect(isMonthDisabled(2026, 9, limits)).toBe(true);
    expect(isMonthDisabled(2026, 10, { minDate: "2026-10-05" })).toBe(false);
    expect(isMonthDisabled(2027, 1, limits)).toBe(true);
    // November 1, 2026 is a Sunday.
    expect(isMonthDisabled(2026, 11, { disabledDateFunc: sunday })).toBe(true);
    expect(isMonthDisabled(2026, 11, { disabledDateFunc: sunday }, true)).toBe(false);
    expect(isYearDisabled(2025, limits)).toBe(true);
    expect(isYearDisabled(2026, { maxDate: "2026-12-20" })).toBe(false);
  });
});

describe("picker values", () => {
  it("are written as a date, a month or a year", () => {
    expect(formatPickerValue("2026-10-09", "days", "en-US")).toBe("10/09/2026");
    expect(formatPickerValue("2026-10-01", "months", "en-US")).toBe("October 2026");
    expect(formatPickerValue("2026-01-01", "years", "en-US")).toBe("2026");
    expect(formatPickerValue("soon", "days", "en-US")).toBe("soon");
  });

  it("are read back as typed in the locale", () => {
    expect(parsePickerValue("9.10.2026", "days", "de-DE")).toBe("2026-10-09");
    expect(parsePickerValue("October 2026", "months", "en-US")).toBe("2026-10-01");
    expect(parsePickerValue("Okt. 2026", "months", "de-DE")).toBe("2026-10-01");
    expect(parsePickerValue("10/2026", "months", "en-US")).toBe("2026-10-01");
    expect(parsePickerValue("2026-10", "months", "en-US")).toBe("2026-10-01");
    expect(parsePickerValue("2026", "years", "en-US")).toBe("2026-01-01");
    expect(parsePickerValue("13/2026", "months", "en-US")).toBeUndefined();
    expect(parsePickerValue("someday", "years", "en-US")).toBeUndefined();
  });
});
