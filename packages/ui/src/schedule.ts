/**
 * The Scheduler's model (design-extended-library.md §2.2): the appointment
 * layer over days — month, week and day views, all-day appointments, and a
 * lane layout where the timed appointments overlap. Doctrine from `calendar.ts`: dates are ISO
 * text without a zone, so no time zone can shift the day; the scheduler's day-times are the local
 * shapes their .NET `DateTime` serializes as (`"2026-10-16T09:00"`). No DOM here — a skin renders
 * `days`.
 */

import { addDays, addMonths, isoDate, parseIsoDate, type IsoDate } from "./calendar.js";
import type { Intent } from "./vocabulary.js";

/** A point in the scheduler's day-times: an ISO local datetime, `"2026-10-16T09:00"`. */
export type IsoDateTime = string;

/** An appointment: a title, its start and its end (exclusive), all-day or timed, and how it looks. */
export interface ScheduleAppointment {
  /** A stable identity for keys and selection (optional: defaults to the object's identity). */
  id?: string | number;
  /** The header text (a longer body stays the app's — as a fragment in the details). */
  title: string;
  /** The start, an ISO local day-time (`"2026-10-16T09:00"`). */
  start: IsoDateTime;
  /** The end, exclusive (the next day's `T00:00` is midnight); default: an hour after the start. */
  end?: IsoDateTime;
  /** True: an all-day appointment (the day's all-day row, no lane). */
  allDay?: boolean;
  /** The color slot among the vocabulary's intents (default "primary"). */
  intent?: Intent;
}

/** A day-time split: the day and the minutes from midnight (0–1439). */
export interface DayTime {
  date: IsoDate;
  minutes: number;
}

const DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/** Parses an ISO local day-time (`"2026-10-16T09:30"`); a date alone is midnight; undefined for anything else. */
export function parseIsoDateTime(text: string | null | undefined): DayTime | undefined {
  const match = DATETIME.exec(text ?? "");
  if (match === null) return undefined;
  const day = `${match[1]}-${match[2]}-${match[3]}`;
  if (parseIsoDate(day) === undefined) return undefined;
  const hours = Number(match[4] ?? 0);
  const minutes = Number(match[5] ?? 0);
  if (hours > 23 || minutes > 59 || (match[6] !== undefined && Number(match[6]) > 59)) return undefined;
  return { date: day, minutes: hours * 60 + minutes };
}

/** The appointment's end as it shows on the day clock (1440 = a midnight end; default: an hour after the start). */
function endOfDayTime(appointment: ScheduleAppointment): { date: IsoDate; minutes: number } {
  const to = parseIsoDateTime(appointment.end);
  if (to !== undefined) return to;
  const from = parseIsoDateTime(appointment.start)!;
  return from.minutes + 60 >= 1440 ? { date: addDays(from.date, 1), minutes: 0 } : { date: from.date, minutes: from.minutes + 60 };
}

/** The last day the appointment is present in (the end is exclusive: a midnight end's last day is the one before). */
function endDayOf(appointment: ScheduleAppointment): IsoDate {
  const to = endOfDayTime(appointment);
  return to.minutes === 0 ? addDays(to.date, -1) : to.date;
}

/** Whether the appointment's span holds `date` (a multi-day one is present in each of its days). */
function presentOn(appointment: ScheduleAppointment, date: IsoDate): boolean {
  const from = parseIsoDateTime(appointment.start)!.date;
  return date >= from && date <= endDayOf(appointment);
}

/** One timed appointment placed in a day's layout: the minutes it holds there and its lane. */
export interface ScheduleBlock {
  appointment: ScheduleAppointment;
  /** The start on the day clock, minutes (an appointment of another day begins at 0). */
  fromMinutes: number;
  /** The end on the day clock, exclusive (an appointment reaching into the next day ends at 1440). */
  toMinutes: number;
  /** The lane it lays in (0-based; overlapping appointments side by side). */
  lane: number;
  /** How many lanes the appointments running alongside occupy; the width share is 1/lanes. */
  lanes: number;
}

/** One day of the view: its parts for the skin's column. */
export interface ScheduleDay {
  /** The day, ISO. */
  date: IsoDate;
  /** The weekday index, 0-based from the model's `weekStartsOn`. */
  weekday: number;
  /** It holds the model's today. */
  isToday: boolean;
  /** It lies before or after the view anchor's month (a month grid's edge days). */
  isOutOfMonth: boolean;
  /** The all-day appointments present (in the appointments' order). */
  allDay: readonly ScheduleAppointment[];
  /** The timed appointments placed into lanes, in day order. */
  timed: readonly ScheduleBlock[];
}

/** What the scheduler shows: month (the calendar grid's six weeks), week or day. */
export type ScheduleView = "month" | "week" | "day";

/** Where a week starts, as `getDay` counts: Sunday 0, Monday 1, … */
export type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function todayOf(): IsoDate {
  const now = new Date();
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function weekdayOf(date: IsoDate, weekStartsOn: number): number {
  const shifted = new Date(`${date}T00:00:00Z`).getUTCDay() - weekStartsOn;
  return (shifted + 7) % 7;
}

/**
 * The scheduler's state: the appointments, the view (month, week or day, anchored to a day) and
 * the selected appointment. A skin creates one, feeds `appointments`/`view`/`anchor` and renders
 * `days`; `onChange` asks it to render again.
 */
export class ScheduleModel {
  private appointments: readonly ScheduleAppointment[] = [];
  private view: ScheduleView = "month";
  private anchorDay: IsoDate | undefined;
  private selectedAppointment: ScheduleAppointment | undefined;

  /** Where a week starts, as `getDay` counts: Sunday 0, Monday 1 (the default). The skin sets it before the first render. */
  weekStartsOn: number = 1;

  constructor(private readonly onChange: () => void) {}

  /** Sets the app's appointments; compared by identity (an app's own field stays itself across renders); true when they changed. */
  setAppointments(appointments: readonly ScheduleAppointment[] | undefined): boolean {
    if (appointments === this.appointments) return false;
    this.appointments = appointments ?? [];
    return true;
  }

  /** Sets the view and its anchor (a day inside the window; default: today); true when it changed; a change clears the selection. */
  setView(view: ScheduleView, anchor?: IsoDate): boolean {
    const anchorValue = anchor ?? todayOf();
    if (view === this.view && anchorValue === this.anchorDay) return false;
    this.view = view;
    this.anchorDay = anchorValue;
    this.selectedAppointment = undefined;
    return true;
  }

  /** The window's anchor (a day inside the visible days; the navigation moves it). */
  get anchor(): IsoDate {
    return this.anchorDay ?? todayOf();
  }

  /** The current view. */
  get currentView(): ScheduleView {
    return this.view;
  }

  /** The selected appointment, if any (a click set it; a navigation cleared it). */
  get selected(): ScheduleAppointment | undefined {
    return this.selectedAppointment;
  }

  /** Selects an appointment (clicking the selected one deselects); the skin announces it itself. */
  select(appointment: ScheduleAppointment | undefined): void {
    this.selectedAppointment = this.selectedAppointment === appointment ? undefined : appointment;
    this.onChange();
  }

  /** Whether `appointment` is the selected one (the skin's styles and aria speak it). */
  isSelected(appointment: ScheduleAppointment): boolean {
    return this.selectedAppointment === appointment;
  }

  /** Moves the window back, forward or to today; clears the selection. */
  navigate(direction: "previous" | "next" | "today"): void {
    this.selectedAppointment = undefined;
    this.anchorDay =
      direction === "today" ? todayOf() : this.view === "month" ? addMonths(this.anchor, direction === "previous" ? -1 : 1) : addDays(this.anchor, (direction === "previous" ? -1 : 1) * (this.view === "week" ? 7 : 1));
    this.onChange();
  }

  /** The view's days: 42 (month, six weeks), 7 (week) or 1 — each with its all-day and timed parts. */
  get days(): readonly ScheduleDay[] {
    const anchor = this.anchor;
    if (this.view === "day") return [this.dayOf(anchor, anchor)];
    const first = this.view === "week" ? addDays(anchor, -weekdayOf(anchor, this.weekStartsOn)) : monthStart(anchor, this.weekStartsOn);
    const count = this.view === "week" ? 7 : 42;
    return Array.from({ length: count }, (_, index) => this.dayOf(addDays(first, index), anchor));
  }

  /** One day's parts: its weekday, today, out-of-month, the appointments found and laid out. */
  private dayOf(date: IsoDate, anchor: IsoDate): ScheduleDay {
    const allDay: ScheduleAppointment[] = [];
    const timed: ScheduleAppointment[] = [];
    for (const appointment of this.appointments) {
      if (!presentOn(appointment, date)) continue;
      (appointment.allDay === true ? allDay : timed).push(appointment);
    }
    return {
      date,
      weekday: weekdayOf(date, this.weekStartsOn),
      isToday: date === todayOf(),
      isOutOfMonth: date.slice(5, 7) !== anchor.slice(5, 7),
      allDay,
      timed: layoutLanes(timed, date),
    };
  }
}

/** A month grid's first day: the week's first day in the anchor's month's first week. */
function monthStart(anchor: IsoDate, weekStartsOn: number): IsoDate {
  return addDays(`${anchor.slice(0, 7)}-01`, -weekdayOf(`${anchor.slice(0, 7)}-01`, weekStartsOn));
}

/**
 * Lays a day's timed appointments into side-by-side lanes: greedy assignment
 * over the whole day (a lane frees at its end), then the days' overlap groups
 * (connected by time) mark each block's width share. The result keeps the
 * day's order.
 */
function layoutLanes(appointments: readonly ScheduleAppointment[], date: IsoDate): ScheduleBlock[] {
  const prepared = appointments.map((appointment) => {
    const from = parseIsoDateTime(appointment.start)!;
    const to = endOfDayTime(appointment);
    return {
      appointment,
      fromMinutes: from.date === date ? from.minutes : 0,
      toMinutes: to.date === date ? to.minutes : 1440,
    };
  });
  prepared.sort((a, b) => a.fromMinutes - b.fromMinutes || a.toMinutes - b.toMinutes);
  // Pass 1: greedy lanes across the day (a lane frees at its end).
  const laneEnds: number[] = [];
  const laneOf: number[] = [];
  prepared.forEach((block, index) => {
    let lane = laneEnds.findIndex((end) => end <= block.fromMinutes);
    if (lane === -1) lane = laneEnds.push(0) - 1;
    laneEnds[lane] = block.toMinutes;
    laneOf[index] = lane;
  });
  // Pass 2: the overlap groups; a group's lanes is the width share's denominator.
  const result: ScheduleBlock[] = [];
  let groupStart = 0;
  let groupEnd = 0;
  let groupLanes = 0;
  const flush = (upTo: number): void => {
    for (let index = groupStart; index < upTo; index++) {
      const block = prepared[index]!;
      result.push({ appointment: block.appointment, fromMinutes: block.fromMinutes, toMinutes: block.toMinutes, lane: laneOf[index]!, lanes: groupLanes });
    }
  };
  prepared.forEach((block, index) => {
    if (index > groupStart && block.fromMinutes >= groupEnd) {
      flush(index);
      groupStart = index;
      groupEnd = 0;
      groupLanes = 0;
    }
    groupEnd = Math.max(groupEnd, block.toMinutes);
    groupLanes = Math.max(groupLanes, laneOf[index]! + 1);
  });
  flush(prepared.length);
  return result;
}