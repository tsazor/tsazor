import { describe, expect, it } from "vitest";
import {
  edgeEnabledOption,
  formatTimeField,
  formatTimePickerValue,
  initialTimeOption,
  isoTime,
  nextEnabledOption,
  normalizeIsoTime,
  parseIsoTime,
  parseTimeField,
  timeFieldPlaceholder,
  timeOptions,
} from "../src/time.js";

/** Intl may put a narrow no-break space before AM/PM. */
const plain = (text: string): string => text.replace(/[  ]/g, " ");

describe("ISO times", () => {
  it("reads HH:mm and HH:mm:ss, and writes HH:mm:ss", () => {
    expect(parseIsoTime("14:30")).toEqual({ hours: 14, minutes: 30, seconds: 0 });
    expect(parseIsoTime("09:05:07")).toEqual({ hours: 9, minutes: 5, seconds: 7 });
    expect(parseIsoTime("14:30:00.1234567")).toEqual({ hours: 14, minutes: 30, seconds: 0 });
    expect(parseIsoTime("24:00")).toBeUndefined();
    expect(parseIsoTime("9:30")).toBeUndefined();
    expect(parseIsoTime("2:30 PM")).toBeUndefined();
    expect(isoTime(9, 5)).toBe("09:05:00");
    expect(normalizeIsoTime("14:30")).toBe("14:30:00");
    expect(normalizeIsoTime("noon")).toBeUndefined();
  });
});

describe("timeOptions", () => {
  it("lists startHour to endHour every increment minutes (Fluent UI Blazor's defaults: 8 to 18, 15)", () => {
    const options = timeOptions();
    expect(options[0]).toBe("08:00:00");
    expect(options[1]).toBe("08:15:00");
    expect(options.at(-1)).toBe("18:00:00");
    expect(options).toHaveLength(41);
  });

  it("leaves midnight out at the end of the day, and counts an increment of 0 as 1", () => {
    expect(timeOptions(22, 24, 30)).toEqual(["22:00:00", "22:30:00", "23:00:00", "23:30:00"]);
    expect(timeOptions(23, 24, 0)).toHaveLength(60);
    expect(timeOptions(10, 9, 15)).toEqual(["10:00:00"]);
  });
});

describe("the locale's time field", () => {
  it("writes the time as the locale does, seconds only when there are some", () => {
    expect(plain(formatTimeField("14:30:00", "en-US"))).toBe("2:30 PM");
    expect(formatTimeField("14:30:00", "de-DE")).toBe("14:30");
    expect(formatTimeField("09:00:00", "de-DE")).toBe("09:00");
    expect(plain(formatTimeField("09:00:00", "en-US"))).toBe("9:00 AM");
    expect(plain(formatTimeField("14:30:00", "de-DE", "h12"))).toBe("02:30 PM");
    expect(formatTimeField("14:30:00", "en-US", "h23")).toBe("14:30");
    expect(plain(formatTimeField("09:05:07", "en-US"))).toBe("9:05:07 AM");
    expect(formatTimePickerValue("soon", "en-US")).toBe("soon");
  });

  it("shows the locale's pattern as the placeholder", () => {
    expect(plain(timeFieldPlaceholder("en-US"))).toBe("hh:mm AM/PM");
    expect(timeFieldPlaceholder("de-DE")).toBe("hh:mm");
  });

  it("reads what someone types: ISO, the locale's way, AM and PM anywhere, 14h30, the digits only", () => {
    expect(parseTimeField("14:30", "en-US")).toBe("14:30:00");
    expect(parseTimeField("2:30 PM", "en-US")).toBe("14:30:00");
    expect(parseTimeField("2:30 PM", "en-US")).toBe("14:30:00");
    expect(parseTimeField("2:30 p.m.", "en-US")).toBe("14:30:00");
    expect(parseTimeField("2pm", "en-US")).toBe("14:00:00");
    expect(parseTimeField("12 am", "en-US")).toBe("00:00:00");
    expect(parseTimeField("12:15 PM", "en-US")).toBe("12:15:00");
    expect(parseTimeField("9:30", "en-US")).toBe("09:30:00");
    expect(parseTimeField("14.30", "de-DE")).toBe("14:30:00");
    expect(parseTimeField("14h30", "fr-FR")).toBe("14:30:00");
    expect(parseTimeField("930", "de-DE")).toBe("09:30:00");
    expect(parseTimeField("1430", "de-DE")).toBe("14:30:00");
    expect(parseTimeField("2:30:15 PM", "en-US")).toBe("14:30:15");
    expect(parseTimeField(formatTimeField("14:30:00", "ko-KR"), "ko-KR")).toBe("14:30:00");
  });

  it("refuses what is no time", () => {
    expect(parseTimeField("soon", "en-US")).toBeUndefined();
    expect(parseTimeField("25:00", "en-US")).toBeUndefined();
    expect(parseTimeField("13 pm", "en-US")).toBeUndefined();
    expect(parseTimeField("9:75", "en-US")).toBeUndefined();
    expect(parseTimeField("1:2:3:4", "en-US")).toBeUndefined();
  });
});

describe("the list's keys", () => {
  const options = ["08:00:00", "08:30:00", "09:00:00", "09:30:00"];

  it("opens on the value, else the first time after it, skipping a disabled one", () => {
    expect(initialTimeOption(options, "09:00:00", [false, false, false, false])).toBe(2);
    expect(initialTimeOption(options, "08:40", [false, false, false, false])).toBe(2);
    expect(initialTimeOption(options, "23:00:00", [false, false, false, false])).toBe(0);
    expect(initialTimeOption(options, "", [false, false, false, false])).toBe(0);
    expect(initialTimeOption(options, "09:00:00", [false, false, true, false])).toBe(3);
    expect(initialTimeOption(options, "09:00:00", [true, true, true, true])).toBe(-1);
  });

  it("moves to the next enabled option, wrapping; the edges are the first and last enabled", () => {
    const disabled = [true, false, true, false];
    expect(nextEnabledOption(1, 1, disabled)).toBe(3);
    expect(nextEnabledOption(3, 1, disabled)).toBe(1);
    expect(nextEnabledOption(1, -1, disabled)).toBe(3);
    expect(edgeEnabledOption(1, disabled)).toBe(1);
    expect(edgeEnabledOption(-1, disabled)).toBe(3);
    expect(nextEnabledOption(0, 1, [true, true])).toBe(-1);
  });
});
