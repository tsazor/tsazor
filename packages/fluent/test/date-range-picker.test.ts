/**
 * DateRangePicker (MudBlazor's MudDateRangePicker; the BlazorHero port's B45): a range of ISO dates, typed into its
 * two fields or picked in a range calendar — a start, then an end; the start again is a range of that one day.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EditForm, EventCallback, type EditContext, type RenderTreeBuilder } from "@tsazor/runtime";
import type { DateRange } from "@tsazor/ui";
import { DateRangePicker } from "../dist/index.js";

interface Trip {
  dates: DateRange | null;
}

/** One DateRangePicker bound to `trip.dates` inside an EditForm. */
async function renderPicker(trip: Trip, parameters: Record<string, unknown> = {}) {
  let context: EditContext | undefined;
  const changes: (DateRange | null)[] = [];
  const result = await renderTree((b) => {
    b.openComponent(0, EditForm);
    b.addAttribute(1, "model", trip);
    b.addAttribute(2, "childContent", ((editContext: EditContext) => (inner: RenderTreeBuilder) => {
      context = editContext;
      inner.openComponent(0, DateRangePicker);
      inner.addAttribute(1, "label", "Trip");
      inner.addAttribute(2, "value", trip.dates);
      inner.addAttribute(3, "valueChanged", EventCallback.unbound((value: DateRange | null) => {
        trip.dates = value;
        changes.push(value);
      }));
      inner.addAttribute(4, "valueExpression", "dates");
      inner.addAttribute(5, "locale", "de-DE");
      let sequence = 6;
      for (const [name, value] of Object.entries(parameters)) inner.addAttribute(sequence++, name, value);
      inner.closeComponent();
    }) as never);
    b.closeComponent();
  });
  const [start, end] = [...result.container.querySelectorAll("input")] as HTMLInputElement[];
  const type = async (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await result.settle();
  };
  const openCalendar = async () => {
    (result.container.querySelector("button[aria-haspopup=dialog]") as HTMLButtonElement).click();
    await result.settle();
  };
  const day = async (date: string) => {
    (document.querySelector(`[role=dialog] td[data-value="${date}"]`) as HTMLElement).click();
    await result.settle();
  };
  return { ...result, start: start!, end: end!, type, openCalendar, day, changes, context: () => context! };
}

describe("DateRangePicker", () => {
  it("writes both ends as the locale writes a date, in a named group", async () => {
    const { container, start, end } = await renderPicker({ dates: { start: "2026-10-05", end: "2026-10-09" } });
    expect([start.value, end.value]).toEqual(["05.10.2026", "09.10.2026"]);
    expect([start.getAttribute("aria-label"), end.getAttribute("aria-label")]).toEqual(["Start date", "End date"]);
    const group = container.querySelector("[role=group]")!;
    expect(document.getElementById(group.getAttribute("aria-labelledby")!)?.textContent).toBe("Trip");
    // Each end is named by the field's label and its own name ("Trip Start date"), and described by the format.
    const label = container.querySelector("label")!;
    expect(start.getAttribute("aria-labelledby")).toBe(`${label.id} ${start.id}`);
    expect(end.getAttribute("aria-labelledby")).toBe(`${label.id} ${end.id}`);
    for (const input of [start, end]) expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Format DD.MM.YYYY");
  });

  it("without a label, each end is named by the group's ariaLabel and its own name", async () => {
    const { container, start } = await renderPicker({ dates: null }, { label: undefined, ariaLabel: "Stay" });
    const group = container.querySelector("[role=group]")!;
    expect(group.getAttribute("aria-label")).toBe("Stay");
    expect(start.getAttribute("aria-labelledby")).toBe(`${group.id} ${start.id}`);
  });

  it("takes typed ends, in order; an open end stays open, both empty is null", async () => {
    const trip: Trip = { dates: null };
    const { start, end, type, changes } = await renderPicker(trip);
    await type(start, "09.10.2026");
    await type(end, "05.10.2026");
    expect(trip.dates).toEqual({ start: "2026-10-05", end: "2026-10-09" });
    await type(start, "");
    await type(end, "");
    expect(changes).toEqual([{ start: "2026-10-09" }, { start: "2026-10-05", end: "2026-10-09" }, { end: "2026-10-09" }, null]);
  });

  it("keeps the range on text that is no date, with the field's parsing message: the form doesn't submit", async () => {
    const trip: Trip = { dates: { start: "2026-10-05", end: "2026-10-09" } };
    const { end, type, changes, context } = await renderPicker(trip);
    await type(end, "next Friday");
    expect([changes, end.value]).toEqual([[], "next Friday"]);
    expect(context().getValidationMessages("dates")).toEqual(["The Trip field must be a date."]);
    expect(context().validate()).toBe(false);
    await type(end, "10.10.2026");
    expect(context().getValidationMessages("dates")).toEqual([]);
    expect(trip.dates).toEqual({ start: "2026-10-05", end: "2026-10-10" });
  });

  it("picks a start, then an end in the calendar, which closes then", async () => {
    const trip: Trip = { dates: { start: "2026-10-05", end: "2026-10-09" } };
    const { openCalendar, day, changes } = await renderPicker(trip);
    await openCalendar();
    expect(document.querySelectorAll("[role=dialog] td[aria-selected=true]").length).toBe(5);
    await day("2026-10-12");
    expect(changes).toEqual([]);
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
    await day("2026-10-14");
    expect(changes).toEqual([{ start: "2026-10-12", end: "2026-10-14" }]);
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  it("makes a range of one day of the start picked again", async () => {
    const trip: Trip = { dates: { start: "2026-10-05", end: "2026-10-09" } };
    const { openCalendar, day } = await renderPicker(trip);
    await openCalendar();
    await day("2026-10-20");
    await day("2026-10-20");
    expect(trip.dates).toEqual({ start: "2026-10-20", end: "2026-10-20" });
  });
});
