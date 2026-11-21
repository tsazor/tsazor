/**
 * TextInput's mask (MudBlazor's `MudTextField Mask="@(new PatternMask(...))"`): the text shaped as it is typed, the
 * value masked or clean, a clean value shown masked, the number keyboard for digits.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { PatternMask } from "@tsazor/ui";
import { TextInput } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

async function field(mask: PatternMask | string, value = "", extra: Record<string, unknown> = {}) {
  class Host extends ComponentBase {
    static last: Host | undefined;
    value = value;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      b.openComponent(0, TextInput);
      b.addAttribute(1, "value", this.value);
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (next: string) => {
        this.value = next;
      }));
      b.addAttribute(3, "label", "Phone");
      b.addAttribute(4, "mask", mask);
      let seq = 5;
      for (const [name, val] of Object.entries(extra)) b.addAttribute(seq++, name, val);
      b.closeComponent();
    }
  }
  const result = await render(Host);
  mounted.push(result);
  const input = result.container.querySelector<HTMLInputElement>("input")!;
  const idle = () => result.settle();
  const type = async (text: string) => {
    input.focus();
    input.value = text;
    input.setSelectionRange(text.length, text.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await idle();
  };
  return { Host, input, idle, type };
}

describe("TextInput mask", () => {
  it("shapes the text as it is typed, and binds the masked text", async () => {
    const { Host, input, type } = await field("(000) 000-0000");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    await type("1234");
    expect(input.value).toBe("(123) 4");
    await type("12345678901");
    expect(input.value).toBe("(123) 456-7890");
    expect(Host.last!.value).toBe("(123) 456-7890");
  });

  it("cleanDelimiters binds the characters only and shows them masked", async () => {
    const { Host, input, type } = await field(new PatternMask("(000) 000-0000", { cleanDelimiters: true }), "0301234567");
    expect(input.value).toBe("(030) 123-4567");
    await type("(030) 765-4321");
    expect(Host.last!.value).toBe("0307654321");
  });

  it("letters with a transformation; no number keyboard", async () => {
    const { Host, input, type } = await field(new PatternMask("aa-0000", { transform: (char) => char.toUpperCase() }));
    expect(input.hasAttribute("inputmode")).toBe(false);
    await type("hb1234");
    expect(Host.last!.value).toBe("HB-1234");
  });

  it("immediate: the value follows the masked typing", async () => {
    const { Host, input, idle } = await field("0000 0000", "", { immediate: true, immediateDelay: 0 });
    input.focus();
    input.value = "12345";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    await idle();
    expect(input.value).toBe("1234 5");
    expect(Host.last!.value).toBe("1234 5");
  });
});
