/**
 * Attribute and event-handler patching. Review §3: R10.
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, EventCallback } from "@tsazor/runtime";
import { host } from "./host.js";

class Receiver extends ComponentBase {}

describe("R10 — event handlers", () => {
  it("setting a handler to null removes the listener", async () => {
    const calls: string[] = [];
    let handler: (() => void) | null = () => calls.push("clicked");
    const h = await host((b) => {
      b.openElement(0, "button");
      b.addAttribute(1, "onclick", handler);
      b.closeElement();
    });
    handler = null;
    await h.update();
    h.container.querySelector("button")!.dispatchEvent(new Event("click"));
    await h.settle();
    expect(calls).toEqual([]);
  });

  it("an equal callback created per render does not rebind the DOM listener", async () => {
    // The compiler emits EventCallback.bind(this, this.handler) on every render:
    // new object, same receiver + delegate — the listener must stay.
    const receiver = new Receiver();
    const handler = (): void => {};
    const h = await host((b) => {
      b.openElement(0, "button");
      b.addAttribute(1, "onclick", EventCallback.bind(receiver, handler));
      b.closeElement();
    });
    const button = h.container.querySelector("button")!;
    let rebinds = 0;
    const original = button.addEventListener.bind(button);
    button.addEventListener = ((...args: Parameters<typeof original>) => {
      rebinds++;
      original(...args);
    }) as typeof button.addEventListener;
    await h.update();
    expect(rebinds).toBe(0);
  });
});

describe("R10 — form element properties", () => {
  it("checked is synced as a property after user interaction", async () => {
    let checked = true;
    const h = await host((b) => {
      b.openElement(0, "input");
      b.addAttribute(1, "type", "checkbox");
      b.addAttribute(2, "checked", checked);
      b.closeElement();
    });
    const input = h.container.querySelector("input")!;
    input.click();
    expect(input.checked).toBe(false);
    checked = false;
    await h.update();
    checked = true;
    await h.update();
    expect(input.checked).toBe(true);
  });

  it("select value is applied after its options exist", async () => {
    const h = await host((b) => {
      b.openElement(0, "select");
      b.addAttribute(1, "value", "b");
      for (const v of ["a", "b"]) {
        b.openElement(2, "option");
        b.addAttribute(3, "value", v);
        b.addContent(4, v);
        b.closeElement();
      }
      b.closeElement();
    });
    expect(h.container.querySelector("select")!.value).toBe("b");
  });

  it("getter-only properties (button.form, input.list) are set as attributes", async () => {
    const h = await host((b) => {
      b.openElement(0, "button");
      b.addAttribute(1, "form", "f1");
      b.closeElement();
      b.openElement(2, "input");
      b.addAttribute(3, "list", "dl");
      b.closeElement();
    });
    expect(h.container.querySelector("button")!.getAttribute("form")).toBe("f1");
    expect(h.container.querySelector("input")!.getAttribute("list")).toBe("dl");
  });

  it("removing the value attribute clears input.value", async () => {
    let has = true;
    const h = await host((b) => {
      b.openElement(0, "input");
      if (has) b.addAttribute(1, "value", "hello");
      b.closeElement();
    });
    has = false;
    await h.update();
    expect(h.container.querySelector("input")!.value).toBe("");
  });
});
