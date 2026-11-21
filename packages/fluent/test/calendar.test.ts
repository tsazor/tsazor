/**
 * Calendar (Fluent UI Blazor's FluentCalendar): a month of days in the locale's order, the value picked by a click or
 * the keys (the WAI-ARIA date grid), days ruled out by min, max and a function, multiple and range selection, the
 * title zooming out to months and years, a months view that picks a month.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { Calendar } from "../dist/index.js";

const PREFIX = "fui";

const hosts: RenderResult[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

/** A page with a calendar bound to `value` and `dates`. */
function hostOf(attrs: Record<string, unknown>) {
  return class Host extends ComponentBase {
    static last: Host | undefined;
    value = "2026-10-10";
    dates: string[] = [];
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openComponent(0, Calendar);
      b.addAttribute(1, "value", this.value);
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (value: string) => {
        this.value = value;
      }));
      b.addAttribute(3, "selectedDates", this.dates);
      b.addAttribute(4, "selectedDatesChanged", EventCallback.bind(this, (dates: string[]) => {
        this.dates = dates;
      }));
      b.addAttribute(5, "locale", attrs["locale"] ?? "en-US");
      let seq = 6;
      for (const [name, value] of Object.entries(attrs)) if (name !== "locale") b.addAttribute(seq++, name, value);
      b.closeComponent();
    }
  };
}

async function mount(attrs: Record<string, unknown> = {}) {
  const Host = hostOf(attrs);
  const result = await render(Host);
  hosts.push(result);
  const root = result.container.firstElementChild as HTMLElement;
  const cell = (value: string) => root.querySelector<HTMLElement>(`[data-value="${value}"]`)!;
  const title = () => root.querySelector(`.${PREFIX}-calendar__title`)!.textContent!.trim();
  const idle = () => result.settle();
  return { Host, result, root, cell, title, idle };
}

const press = (target: Element, key: string, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));

describe("Calendar", () => {
  it("shows the value's month in six weeks, from the locale's first weekday", async () => {
    const { root, cell, title } = await mount();
    expect(title()).toBe("October 2026");
    expect(root.querySelector("[role=grid]")!.getAttribute("aria-labelledby")).toBe(root.querySelector(`.${PREFIX}-calendar__title`)!.id);
    // A month or a year turned by the step buttons or Page Up/Down is announced (the WAI-ARIA date picker's title).
    expect(root.querySelector(`.${PREFIX}-calendar__title`)!.getAttribute("aria-live")).toBe("polite");
    expect([...root.querySelectorAll("th")].map((th) => th.textContent!.trim())).toEqual(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
    expect(root.querySelectorAll("tbody tr")).toHaveLength(6);
    expect(cell("2026-10-10").getAttribute("aria-selected")).toBe("true");
    expect(cell("2026-10-10").getAttribute("aria-label")).toBe("Saturday, October 10, 2026");
    expect(cell("2026-10-10").tabIndex).toBe(0);
    expect(cell("2026-09-27").getAttribute("aria-disabled")).toBe("true");
    expect(root.querySelectorAll("[role=grid] [tabindex='0']")).toHaveLength(1);
  });

  it("a click picks a day", async () => {
    const { Host, cell, idle } = await mount();
    cell("2026-10-14").click();
    await idle();
    expect(Host.last!.value).toBe("2026-10-14");
    expect(cell("2026-10-14").getAttribute("aria-selected")).toBe("true");
    expect(cell("2026-10-10").hasAttribute("aria-selected")).toBe(false);
  });

  it("the keys move the focus by days, weeks and months; Enter picks", async () => {
    const { Host, cell, title, idle } = await mount();
    cell("2026-10-10").focus();
    press(cell("2026-10-10"), "ArrowRight");
    await idle();
    expect(document.activeElement).toBe(cell("2026-10-11"));
    press(cell("2026-10-11"), "ArrowDown");
    await idle();
    expect(document.activeElement).toBe(cell("2026-10-18"));
    press(cell("2026-10-18"), "PageDown");
    await idle();
    expect(title()).toBe("November 2026");
    expect(document.activeElement).toBe(cell("2026-11-18"));
    press(cell("2026-11-18"), "Enter");
    await idle();
    expect(Host.last!.value).toBe("2026-11-18");
  });

  it("min, max and a function rule days out; the arrows stop at the limits", async () => {
    const { Host, root, cell, idle } = await mount({ minDate: "2026-10-05", maxDate: "2026-10-28", disabledDateFunc: (date: string) => date === "2026-10-12" });
    for (const date of ["2026-10-04", "2026-10-12", "2026-10-29"]) {
      expect(cell(date).getAttribute("aria-disabled")).toBe("true");
      expect(cell(date).className).toContain(`${PREFIX}-calendar__day--disabled`);
    }
    cell("2026-10-12").click();
    await idle();
    expect(Host.last!.value).toBe("2026-10-10");
    const [previous, next] = [...root.querySelectorAll<HTMLButtonElement>(`.${PREFIX}-calendar__step`)];
    expect(previous!.disabled).toBe(true);
    expect(next!.disabled).toBe(true);
    cell("2026-10-10").focus();
    press(cell("2026-10-10"), "PageDown");
    await idle();
    expect(document.activeElement).toBe(cell("2026-10-28"));
  });

  it("multiple: a click toggles a day", async () => {
    const { Host, cell, idle } = await mount({ selectMode: "multiple", pickerMonth: "2026-10-01" });
    cell("2026-10-14").click();
    await idle();
    cell("2026-10-16").click();
    await idle();
    expect(Host.last!.dates).toEqual(["2026-10-14", "2026-10-16"]);
    cell("2026-10-14").click();
    await idle();
    expect(Host.last!.dates).toEqual(["2026-10-16"]);
  });

  it("range: a start, a preview under the pointer, an end; a click inside clears it", async () => {
    const { Host, root, cell, idle } = await mount({ selectMode: "range", pickerMonth: "2026-10-01" });
    cell("2026-10-14").click();
    await idle();
    expect(Host.last!.dates).toEqual(["2026-10-14"]);
    cell("2026-10-16").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await idle();
    expect(root.querySelectorAll(`.${PREFIX}-calendar__day--preview`)).toHaveLength(3);
    cell("2026-10-16").click();
    await idle();
    expect(Host.last!.dates).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(cell("2026-10-14").className).toContain(`${PREFIX}-calendar__day--range-start`);
    expect(cell("2026-10-16").className).toContain(`${PREFIX}-calendar__day--range-end`);
    cell("2026-10-15").click();
    await idle();
    expect(Host.last!.dates).toEqual([]);
  });

  it("the title zooms out to the months; a month zooms back in", async () => {
    const { root, cell, title, idle } = await mount();
    (root.querySelector(`.${PREFIX}-calendar__title`) as HTMLButtonElement).click();
    await idle();
    expect(title()).toBe("2026");
    expect(root.querySelectorAll("[role=grid] td")).toHaveLength(12);
    cell("2026-03").click();
    await idle();
    expect(title()).toBe("March 2026");
  });

  it("view months picks a month (its first day); view years a year", async () => {
    const months = await mount({ view: "months" });
    months.cell("2026-03").click();
    await months.idle();
    expect(months.Host.last!.value).toBe("2026-03-01");
    expect(months.cell("2026-03").getAttribute("aria-selected")).toBe("true");
    const years = await mount({ view: "years" });
    expect(years.title()).toBe("2016 – 2027");
    expect(years.root.querySelector(`button.${PREFIX}-calendar__title`)).toBeNull();
    years.cell("2020").click();
    await years.idle();
    expect(years.Host.last!.value).toBe("2020-01-01");
  });

  it("names and the first weekday from the locale", async () => {
    const { root, title } = await mount({ locale: "de-DE" });
    expect(title()).toBe("Oktober 2026");
    expect(root.querySelector("th")!.textContent!.trim()).toBe("Mo");
  });
});
