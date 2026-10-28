/** The Bootstrap skin's DatePicker behaves as the Fluent skin's (packages/fluent/test/date-picker.test.ts). */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { DatePicker } from "../dist/index.js";

const hosts: RenderResult[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

function hostOf(attrs: Record<string, unknown>) {
  return class Host extends ComponentBase {
    static last: Host | undefined;
    value = "2026-10-10";
    opened: boolean[] = [];
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openComponent(0, DatePicker);
      b.addAttribute(1, "value", this.value);
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (value: string) => {
        this.value = value;
      }));
      b.addAttribute(3, "label", "Pickup");
      b.addAttribute(4, "locale", "en-US");
      b.addAttribute(5, "onCalendarOpen", EventCallback.bind(this, (open: boolean) => {
        this.opened.push(open);
      }));
      let seq = 6;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      b.closeComponent();
    }
  };
}

async function mount(attrs: Record<string, unknown> = {}) {
  const Host = hostOf(attrs);
  const result = await render(Host);
  hosts.push(result);
  const input = result.container.querySelector<HTMLInputElement>("input")!;
  const button = result.container.querySelector<HTMLButtonElement>("button")!;
  const dialog = () => result.container.querySelector<HTMLElement>("[role=dialog]");
  const idle = () => result.settle();
  return { Host, result, input, button, dialog, idle };
}

async function type(input: HTMLInputElement, text: string, idle: () => Promise<void>): Promise<void> {
  input.value = text;
  input.dispatchEvent(new Event("change", { bubbles: true }));
  await idle();
}

describe("DatePicker", () => {
  it("writes the value as the locale does, with the locale's pattern as placeholder", async () => {
    const { input, button, result } = await mount();
    expect(input.value).toBe("10/10/2026");
    expect(input.placeholder).toBe("MM/DD/YYYY");
    // The placeholder says the format only while the field is empty: a description says it always.
    expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Format MM/DD/YYYY");
    expect(result.container.querySelector("label")!.htmlFor).toBe(input.id);
    expect(button.getAttribute("aria-label")).toBe("Choose date");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("reads typed text in the locale's order; empty clears; other text goes to validation as typed", async () => {
    const { Host, input, idle } = await mount();
    await type(input, "10/12/2026", idle);
    expect(Host.last!.value).toBe("2026-10-12");
    expect(input.value).toBe("10/12/2026");
    await type(input, "2026-11-01", idle);
    expect(Host.last!.value).toBe("2026-11-01");
    await type(input, "", idle);
    expect(Host.last!.value).toBe("");
    await type(input, "soon", idle);
    expect(Host.last!.value).toBe("soon");
    expect(input.value).toBe("soon");
  });

  it("the button opens the calendar in a modal dialog, on the value; a picked day closes it", async () => {
    const { Host, button, dialog, idle } = await mount();
    button.click();
    await idle();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(dialog()!.getAttribute("aria-modal")).toBe("true");
    expect(dialog()!.getAttribute("aria-label")).toBe("Choose date");
    const selected = dialog()!.querySelector<HTMLElement>("[data-value='2026-10-10']")!;
    expect(selected.tabIndex).toBe(0);
    expect(document.activeElement).toBe(selected);
    dialog()!.querySelector<HTMLElement>("[data-value='2026-10-21']")!.click();
    await idle();
    expect(Host.last!.value).toBe("2026-10-21");
    expect(dialog()).toBeNull();
    expect(Host.last!.opened).toEqual([true, false]);
  });

  it("Escape closes it; Alt+ArrowDown in the field opens it", async () => {
    const { input, dialog, idle } = await mount();
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    await idle();
    expect(dialog()).not.toBeNull();
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    await idle();
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("view months writes and picks a month", async () => {
    const { Host, input, button, dialog, idle } = await mount({ view: "months" });
    expect(input.value).toBe("October 2026");
    button.click();
    await idle();
    dialog()!.querySelector<HTMLElement>("[data-value='2026-03']")!.click();
    await idle();
    expect(Host.last!.value).toBe("2026-03-01");
    expect(input.value).toBe("March 2026");
  });
});
