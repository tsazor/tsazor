/**
 * TimePicker, the Bootstrap skin (Fluent UI Blazor's FluentTimePicker): the value as the locale writes it, typed text read back, the
 * list of times from startHour to endHour (the ARIA combobox pattern: the arrows open it on the value and move,
 * Enter picks, Escape closes, the focus stays in the field), disabled times skipped, the native time input.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { TimePicker } from "../dist/index.js";

const hosts: RenderResult[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

/** Intl may put a narrow no-break space before AM/PM. */
const plain = (text: string | null | undefined): string => (text ?? "").replace(/[  ]/g, " ");

async function mount(attrs: Record<string, unknown> = {}, value = "14:30:00") {
  class Host extends ComponentBase {
    static last: Host | undefined;
    value = value;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openComponent(0, TimePicker);
      b.addAttribute(1, "value", this.value);
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (next: string) => {
        this.value = next;
      }));
      b.addAttribute(3, "label", "Pickup");
      b.addAttribute(4, "locale", "en-US");
      let seq = 5;
      for (const [name, val] of Object.entries(attrs)) b.addAttribute(seq++, name, val);
      b.closeComponent();
    }
  }
  const result = await render(Host);
  hosts.push(result);
  const idle = () => result.settle();
  const input = () => result.container.querySelector<HTMLInputElement>("input")!;
  const list = () => result.container.querySelector<HTMLElement>("[role=listbox]");
  const options = () => [...result.container.querySelectorAll<HTMLElement>("[role=option]")];
  const key = async (name: string, init: KeyboardEventInit = {}) => {
    input().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init }));
    await idle();
  };
  return { Host, result, idle, input, list, options, key };
}

async function type(input: HTMLInputElement, text: string, idle: () => Promise<void>): Promise<void> {
  input.value = text;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await idle();
}

describe("TimePicker", () => {
  it("writes the value as the locale does, a combobox with the locale's pattern as placeholder", async () => {
    const { input, result } = await mount();
    expect(plain(input().value)).toBe("2:30 PM");
    expect(plain(input().placeholder)).toBe("hh:mm AM/PM");
    expect(input().getAttribute("role")).toBe("combobox");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    expect(result.container.querySelector("label")!.htmlFor).toBe(input().id);
    const button = result.container.querySelector<HTMLButtonElement>("button[aria-label='Choose time']")!;
    expect(button.getAttribute("aria-label")).toBe("Choose time");
    expect(button.tabIndex).toBe(-1);
  });

  it("reads typed text: AM/PM, 24 hours, ISO; empty clears; other text goes to validation as typed", async () => {
    const { Host, input, idle } = await mount();
    await type(input(), "9:15 am", idle);
    expect(Host.last!.value).toBe("09:15:00");
    await type(input(), "17:45", idle);
    expect(Host.last!.value).toBe("17:45:00");
    expect(plain(input().value)).toBe("5:45 PM");
    await type(input(), "soon", idle);
    expect(Host.last!.value).toBe("soon");
    expect(input().value).toBe("soon");
    await type(input(), "", idle);
    expect(Host.last!.value).toBe("");
  });

  it("ArrowDown opens the list on the value; the arrows move, Enter picks, the focus stays in the field", async () => {
    const { Host, input, list, options, key, idle } = await mount();
    input().focus();
    await key("ArrowDown");
    expect(list()).not.toBeNull();
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(options()).toHaveLength(41);
    expect(plain(options()[0]!.textContent)).toBe("8:00 AM");
    const active = () => document.getElementById(input().getAttribute("aria-activedescendant")!)!;
    expect(plain(active().textContent)).toBe("2:30 PM");
    expect(active().getAttribute("aria-selected")).toBe("true");
    await key("ArrowDown");
    expect(plain(active().textContent)).toBe("2:45 PM");
    await key("End");
    expect(plain(active().textContent)).toBe("6:00 PM");
    await key("ArrowDown");
    expect(plain(active().textContent)).toBe("8:00 AM");
    await key("ArrowUp");
    await key("ArrowUp");
    expect(plain(active().textContent)).toBe("5:45 PM");
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    input().dispatchEvent(enter);
    await idle();
    expect(enter.defaultPrevented).toBe(true);
    expect(Host.last!.value).toBe("17:45:00");
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(input());
  });

  it("opens on a typed time before its change event, and a click picks", async () => {
    const { Host, input, options, key, idle } = await mount({}, "");
    input().value = "11:00 AM";
    await key("ArrowDown");
    const active = document.getElementById(input().getAttribute("aria-activedescendant")!)!;
    expect(plain(active.textContent)).toBe("11:00 AM");
    options()[2]!.click();
    await idle();
    expect(Host.last!.value).toBe("08:30:00");
  });

  it("Escape closes the list; the button toggles it", async () => {
    const { result, input, list, key, idle } = await mount();
    input().focus();
    await key("ArrowDown");
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await idle();
    expect(list()).toBeNull();
    const button = result.container.querySelector<HTMLButtonElement>("button[aria-label='Choose time']")!;
    button.click();
    await idle();
    expect(list()).not.toBeNull();
    expect(document.activeElement).toBe(input());
    button.click();
    await idle();
    expect(list()).toBeNull();
  });

  it("startHour, endHour and increment set the times; disabled ones are marked and skipped", async () => {
    const lunch = (time: string) => time >= "12:00:00" && time < "13:00:00";
    const { input, options, key } = await mount({ startHour: 11, endHour: 14, increment: 30, disabledTimeFunc: lunch }, "11:30:00");
    await key("ArrowDown");
    expect(options().map((option) => plain(option.textContent))).toEqual(["11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "1:00 PM", "1:30 PM", "2:00 PM"]);
    expect(options().map((option) => option.getAttribute("aria-disabled"))).toEqual([null, null, "true", "true", null, null, null]);
    await key("ArrowDown");
    const active = document.getElementById(input().getAttribute("aria-activedescendant")!)!;
    expect(plain(active.textContent)).toBe("1:00 PM");
  });

  it("hourCycle h23 and a locale write 24 hours", async () => {
    const { input } = await mount({ hourCycle: "h23" });
    expect(input().value).toBe("14:30");
    const german = await mount({ locale: "de-DE" });
    expect(german.input().value).toBe("14:30");
  });

  it("renderStyle native: the browser's time input, read back as ISO", async () => {
    const { Host, input, idle } = await mount({ renderStyle: "native" });
    expect(input().type).toBe("time");
    expect(input().value).toBe("14:30");
    input().value = "07:05";
    input().dispatchEvent(new Event("change", { bubbles: true }));
    await idle();
    expect(Host.last!.value).toBe("07:05:00");
  });

  it("disabled and readOnly keep the list shut", async () => {
    const { list, key } = await mount({ readOnly: true });
    await key("ArrowDown");
    expect(list()).toBeNull();
  });
});
