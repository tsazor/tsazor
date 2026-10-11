/**
 * Autocomplete (Fluent UI Blazor's FluentAutocomplete): the ARIA combobox with a listbox popup, the
 * keyboard, several values as chips or one value, and the async search where the newest wins.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback } from "@tsazor/runtime";
import { Autocomplete, OptionsSearchEventArgs } from "../dist/index.js";

type Renderer = Awaited<ReturnType<typeof renderTree>>["renderer"];
async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

beforeAll(() => {
  document.body.innerHTML = "";
});

const COLORS = ["Red", "Green", "Blue", "Redwood"];

async function mount(attributes: Record<string, unknown>) {
  const changes: unknown[] = [];
  const mounted = await renderTree((b) => {
    b.openComponent(0, Autocomplete);
    b.addAttribute(1, "label", "Colors");
    let seq = 2;
    for (const [name, value] of Object.entries(attributes)) b.addAttribute(seq++, name, value as never);
    b.addAttribute(20, "selectedOptionsChanged", EventCallback.unbound((value: unknown) => void changes.push(value)));
    b.addAttribute(21, "selectedOptionChanged", EventCallback.unbound((value: unknown) => void changes.push(value)));
    b.closeComponent();
  });
  await settle(mounted.renderer);
  const input = mounted.container.querySelector<HTMLInputElement>("input[role=combobox]")!;
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(mounted.renderer);
  };
  const key = async (name: string) => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
    await settle(mounted.renderer);
  };
  const options = () => [...mounted.container.querySelectorAll("[role=option]")].map((option) => option.textContent?.trim());
  return { ...mounted, input, type, key, options, changes };
}

describe("Autocomplete", () => {
  it("is an ARIA combobox: typing opens the listbox with the matching options", async () => {
    const { container, input, type, options } = await mount({ items: COLORS });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(`label[for="${input.id}"]`)!.textContent).toBe("Colors");
    await type("red");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const listbox = container.querySelector("[role=listbox]")!;
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
    expect(listbox.getAttribute("aria-multiselectable")).toBe("true");
    expect(options()).toEqual(["Red", "Redwood"]);
  });

  it("moves with the arrows (aria-activedescendant), picks with Enter, shows a removable chip", async () => {
    const { container, input, type, key, changes, renderer } = await mount({ items: COLORS });
    await type("re");
    await key("ArrowDown");
    await key("ArrowDown");
    const active = container.querySelector(`#${input.getAttribute("aria-activedescendant")}`)!;
    expect(active.textContent?.trim()).toBe("Green");
    await key("Enter");
    expect(changes).toEqual([["Green"]]);
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.value).toBe("");
    container.querySelector<HTMLButtonElement>("button[aria-label='Remove Green']")!.click();
    await settle(renderer);
    expect(changes).toEqual([["Green"], []]);
    expect(container.querySelector(".tz-autocomplete__chip")).toBeNull();
  });

  it("removes the last chip with Backspace in the empty input, and closes with Escape", async () => {
    const { container, type, key, changes } = await mount({ items: COLORS, selectedOptions: ["Red", "Blue"] });
    await key("Backspace");
    expect(changes).toEqual([["Red"]]);
    expect([...container.querySelectorAll(".tz-autocomplete__chip")].map((chip) => chip.textContent?.replace("×", "").trim())).toEqual(["Red"]);
    await type("g");
    expect(container.querySelector("[role=listbox]")).not.toBeNull();
    await key("Escape");
    expect(container.querySelector("[role=listbox]")).toBeNull();
  });

  it("takes one value without multiple: the input shows the picked option", async () => {
    const { input, type, key, changes } = await mount({ items: COLORS, multiple: false });
    await type("blu");
    await key("ArrowDown");
    await key("Enter");
    expect(changes).toEqual(["Blue"]);
    expect(input.value).toBe("Blue");
  });

  it("searches through onOptionsSearch: a newer search aborts the older, whose late answer is dropped", async () => {
    const pending: Array<{ args: OptionsSearchEventArgs<string>; resolve: () => void }> = [];
    const search = EventCallback.unbound((args: OptionsSearchEventArgs<string>) =>
      new Promise<void>((resolve) => pending.push({ args, resolve })),
    );
    const { input, options, renderer } = await mount({ onOptionsSearch: search });
    // The searches stay open until the test answers them: let the input handlers start, without waiting for them.
    for (const text of ["r", "re"]) {
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(pending.map((entry) => [entry.args.text, entry.args.signal.aborted])).toEqual([["r", true], ["re", false]]);
    // The newer answer first, then the older one arrives late.
    pending[1]!.args.items = ["Red"];
    pending[1]!.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    pending[0]!.args.items = ["Red", "Rust", "Rose"];
    pending[0]!.resolve();
    await settle(renderer);
    expect(options()).toEqual(["Red"]);
  });
});
