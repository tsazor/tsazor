import { describe, expect, it } from "vitest";
import { DateOnly, TimeOnly, TimeSpan } from "../src/index.js";

describe("DateOnly", () => {
  it("parses ISO and renders it back", () => {
    expect(DateOnly.parse("2026-01-31")!.toString()).toBe("2026-01-31");
    expect(DateOnly.parse("garbage")).toBeNull();
  });

  it("validates months and days, including leap years", () => {
    expect(DateOnly.parse("2024-02-29")).not.toBeNull();
    expect(DateOnly.parse("2023-02-29")).toBeNull();
    expect(DateOnly.parse("2026-13-01")).toBeNull();
    expect(DateOnly.parse("2026-04-31")).toBeNull();
  });

  it("adds days across month boundaries without a time zone", () => {
    expect(DateOnly.parse("2026-01-31")!.addDays(1).toString()).toBe("2026-02-01");
    expect(DateOnly.parse("2026-03-01")!.addDays(-1).toString()).toBe("2026-02-28");
  });

  it("compares chronologically", () => {
    const a = DateOnly.parse("2026-01-01")!;
    const b = DateOnly.parse("2026-02-01")!;
    expect(a.compare(b)).toBeLessThan(0);
    expect(a.equals(a)).toBe(true);
  });
});

describe("TimeOnly", () => {
  it("parses the three shapes and renders with the right precision", () => {
    expect(TimeOnly.parse("14:30")!.toString()).toBe("14:30:00");
    expect(TimeOnly.parse("14:30:05")!.toString()).toBe("14:30:05");
    expect(TimeOnly.parse("14:30:05.123")!.toString()).toBe("14:30:05.123");
    expect(TimeOnly.parse("25:00")).toBeNull();
  });

  it("exposes the components", () => {
    const t = new TimeOnly(14, 30, 5, 123);
    expect(t.hour).toBe(14);
    expect(t.minute).toBe(30);
    expect(t.second).toBe(5);
    expect(t.millisecond).toBe(123);
  });

  it("compares by milliseconds of day", () => {
    expect(TimeOnly.parse("09:00")!.compare(TimeOnly.parse("08:59")!)).toBeGreaterThan(0);
    expect(new TimeOnly(14, 30).equals(new TimeOnly(14, 30))).toBe(true);
  });
});

describe("TimeSpan", () => {
  it("builds from minutes and reports totals", () => {
    expect(TimeSpan.fromMinutes(90).totalSeconds).toBe(5400);
    expect(TimeSpan.fromMinutes(90).totalMinutes).toBe(90);
    expect(TimeSpan.fromSeconds(1.5).totalMilliseconds).toBe(1500);
  });

  it("parses .NET's 'c' format and ISO 8601", () => {
    expect(TimeSpan.parse("1.02:03:04")!.toString()).toBe("1.02:03:04");
    expect(TimeSpan.parse("1.02:03:04")!.totalSeconds).toBe(93784);
    expect(TimeSpan.parse("PT3H4M5S")!.totalSeconds).toBe(11045);
    expect(TimeSpan.parse("P3D")!.totalDays).toBe(3);
    expect(TimeSpan.parse("PT0.5S")!.totalMilliseconds).toBe(500);
    expect(TimeSpan.parse("nonsense")).toBeNull();
  });

  it("adds and renders ISO", () => {
    expect(TimeSpan.fromMinutes(30).add(TimeSpan.fromMinutes(45)).totalMinutes).toBe(75);
    expect(TimeSpan.fromMinutes(90).toISOString()).toBe("PT1H30M");
    expect(TimeSpan.fromMinutes(-90).toString()).toBe("-01:30:00");
  });
});
