/**
 * The scheduler's model: ISO day-times, the views' days (42, 7, 1), the
 * navigation, the selection, and the lane layout for overlapping timed
 * appointments. (design-extended-library.md §2.2)
 */
import { describe, expect, it, vi } from "vitest";
import { ScheduleModel, parseIsoDateTime, today, type ScheduleAppointment, type ScheduleDay } from "../src/index";

const todayValue = today();

function appointments(): ScheduleAppointment[] {
  return [
    { title: "Standup", start: "2026-10-15T09:00", end: "2026-10-15T09:15" },
    { title: "Review", start: "2026-10-15T09:00", end: "2026-10-15T10:00" },
    { title: "Lunch", start: "2026-10-15T12:00" },
    { title: "Days off", start: "2026-10-16", end: "2026-10-18", allDay: true },
  ];
}

describe("parseIsoDateTime", () => {
  it("parses local day-times; a date alone is midnight; junk is not a day-time", () => {
    expect(parseIsoDateTime("2026-10-16T09:30")).toEqual({ date: "2026-10-16", minutes: 570 });
    expect(parseIsoDateTime("2026-10-16 09:30:08")).toEqual({ date: "2026-10-16", minutes: 570 });
    expect(parseIsoDateTime("2026-10-16")).toEqual({ date: "2026-10-16", minutes: 0 });
    expect(parseIsoDateTime("2026-13-16T09:30")).toBeUndefined();
    expect(parseIsoDateTime("2026-10-16T24:30")).toBeUndefined();
    expect(parseIsoDateTime("2026-10-16T09:60")).toBeUndefined();
  });
});

describe("ScheduleModel views", () => {
  it("month: six weeks anchored on Monday, out-of-month flagged, today known", () => {
    const model = new ScheduleModel(() => undefined);
    model.setAppointments(appointments());
    model.setView("month", "2026-10-04"); // Sunday: the week begins Monday the 28th of September.
    const days = model.days;
    expect(days).toHaveLength(42);
    expect(days[0]!.date).toBe("2026-09-28");
    expect(days[0]!.weekday).toBe(0);
    // A six-week grid spans further: three Septembers before, November 1 inside week five's tail,
    // and the whole last week: eleven out-of-month days.
    expect(days.filter((day) => day.isOutOfMonth).map((day) => day.date)).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30",
      "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08",
    ]);
    expect(days.find((day) => day.date === todayValue)).toEqual(expect.objectContaining({ isToday: true }));
  });

  it("week: seven days, Monday first; day: one day", () => {
    const model = new ScheduleModel(() => undefined);
    model.setView("week", "2026-10-14");
    expect(model.days.map((day) => day.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
    model.setView("day", "2026-10-16");
    expect(model.days.map((day) => day.date)).toEqual(["2026-10-16"]);
  });

  it("navigates the views; today resets; the selection clears", () => {
    let changes = 0;
    const model = new ScheduleModel(() => changes++);
    model.setAppointments(appointments());
    model.setView("week", "2026-10-14");
    model.navigate("next");
    expect(model.days.map((day) => day.date)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    model.navigate("previous");
    model.navigate("previous");
    expect(model.days[0]!.date).toBe("2026-10-05");
    model.navigate("today");
    // Today's week is the one the scheduler shows; the anchor holds today then.
    expect(model.anchor).toBe(todayValue);
    model.setView("day", "2026-10-15");
    model.navigate("next");
    expect(model.days.map((day) => day.date)).toEqual(["2026-10-16"]);
  });

  it("splits a day's appointments: all-day without lanes, multi-day ones in every day they span", () => {
    const model = new ScheduleModel(() => undefined);
    model.setAppointments(appointments());
    model.setView("week", "2026-10-15");
    const friday = model.days.find((day: ScheduleDay) => day.date === "2026-10-16")!;
    expect(friday.allDay.map((appointment) => appointment.title)).toEqual(["Days off"]);
    expect(friday.timed).toHaveLength(0);
    const saturday = model.days.find((day: ScheduleDay) => day.date === "2026-10-17")!;
    expect(saturday.allDay).toHaveLength(1);
    const sunday = model.days.find((day: ScheduleDay) => day.date === "2026-10-18")!;
    expect(sunday.allDay).toHaveLength(0); // the end (midnight) is exclusive
  });
});

describe("ScheduleModel lanes", () => {
  it("lays overlapping appointments side by side, in minutes of the day clock", () => {
    const model = new ScheduleModel(() => undefined);
    model.setAppointments(appointments());
    model.setView("day", "2026-10-15");
    const day = model.days[0]!;
    // The Standup and the Review overlap: two lanes side by side; the Lunch has a lane of its own.
    const titles = day.timed.map((block) => `${block.appointment.title}:${block.lane}/${block.lanes}`);
    expect(titles).toEqual(["Standup:0/2", "Review:1/2", "Lunch:0/1"]);
    expect(day.timed[0]!.fromMinutes).toBe(540);
    expect(day.timed[0]!.toMinutes).toBe(555);
    expect(day.timed[1]!.toMinutes).toBe(600);
    expect(day.timed[2]!.fromMinutes).toBe(720);
    expect(day.timed[2]!.toMinutes).toBe(780); // the default end: an hour later
  });

  it("lays a chain of single overlaps and reuses freed lanes", () => {
    const model = new ScheduleModel(() => undefined);
    model.setAppointments([
      { title: "A", start: "2026-10-15T08:00", end: "2026-10-15T09:00" },
      { title: "B", start: "2026-10-15T08:30", end: "2026-10-15T10:00" },
      { title: "C", start: "2026-10-15T09:30", end: "2026-10-15T10:30" },
      { title: "D", start: "2026-10-15T11:00" },
    ]);
    model.setView("day", "2026-10-15");
    // A lane frees at its end: C reuses A's (the greedy over the day clock).
    expect(model.days[0]!.timed.map((block) => block.appointment.title + block.lane + "/" + block.lanes)).toEqual(["A0/2", "B1/2", "C0/2", "D0/1"]);
  });

  it("selects and deselects one appointment", () => {
    const onChange = vi.fn();
    const model = new ScheduleModel(onChange);
    const list = appointments();
    model.setAppointments(list);
    model.select(list[0]!);
    expect(model.selected).toBe(list[0]);
    expect(onChange).toHaveBeenCalledTimes(1);
    model.select(list[0]!);
    expect(model.selected).toBeUndefined();
    model.setView("week", "2026-10-15");
    model.select(list[1]);
    expect(model.selected).toBe(list[1]);
  });
});