/**
 * TextInput's contentBefore/contentAfter (Fluent 2's Input slots, MudBlazor's adornments): one field box around
 * an icon, the input and a button; the password field's eye button switches the type without a new input.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { TextInput } from "../dist/index.js";

const mounted: RenderResult[] = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

/** A password field with a search icon before and a show/hide button after, as BlazorHero's login has. */
class Login extends ComponentBase {
  static last: Login | undefined;
  password = "";
  visible = false;
  slots = true;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    Login.last = this;
    b.openComponent(0, TextInput);
    b.addAttribute(1, "label", "Password");
    b.addAttribute(2, "type", this.visible ? "text" : "password");
    b.addAttribute(3, "value", this.password);
    b.addAttribute(4, "valueChanged", EventCallback.bind(this, (next: string) => {
      this.password = next;
    }));
    if (this.slots) {
      b.addAttribute(5, "contentBefore", (inner: RenderTreeBuilder) => {
        inner.openElement(0, "span");
        inner.addAttribute(1, "class", "key-icon");
        inner.closeElement();
      });
      b.addAttribute(6, "contentAfter", (inner: RenderTreeBuilder) => {
        inner.openElement(0, "button");
        inner.addAttribute(1, "type", "button");
        inner.addAttribute(2, "aria-label", this.visible ? "Hide password" : "Show password");
        inner.addAttribute(3, "onclick", EventCallback.bind(this, () => {
          this.visible = !this.visible;
        }));
        inner.closeElement();
      });
    }
    b.closeComponent();
  }
}

async function mount(): Promise<RenderResult> {
  const result = await render(Login);
  mounted.push(result);
  return result;
}

describe("TextInput contentBefore / contentAfter", () => {
  it("puts the slots and the input into one field box; the label still names the input", async () => {
    const { container } = await mount();
    const group = container.querySelector(".fui-input-wrapper > .fui-input-group")!;
    expect([...group.children].map((child) => child.className || child.tagName.toLowerCase())).toEqual([
      "fui-input-group__before",
      "fui-input",
      "fui-input-group__after",
    ]);
    const input = group.querySelector<HTMLInputElement>("input")!;
    expect(container.querySelector("label")!.htmlFor).toBe(input.id);
    expect(group.querySelector(".fui-input-group__before .key-icon")).not.toBeNull();
  });

  it("the button after the text switches the type, and the input stays the same element with its value", async () => {
    const { container, renderer } = await mount();
    const input = container.querySelector<HTMLInputElement>("input")!;
    input.value = "123Pa$$word!";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await renderer.waitUntilIdle();
    expect(Login.last!.password).toBe("123Pa$$word!");
    expect(input.type).toBe("password");

    container.querySelector<HTMLButtonElement>(".fui-input-group__after button")!.click();
    await renderer.waitUntilIdle();

    expect(container.querySelector("input")).toBe(input);
    expect(input.type).toBe("text");
    expect(input.value).toBe("123Pa$$word!");
    expect(container.querySelector(".fui-input-group__after button")!.getAttribute("aria-label")).toBe("Hide password");
  });

  it("without slots the field keeps its plain input", async () => {
    class Plain extends Login {
      override slots = false;
    }
    const result = await render(Plain);
    mounted.push(result);
    expect(result.container.querySelector(".fui-input-group")).toBeNull();
    expect(result.container.querySelector(".fui-input-wrapper > input.fui-input")).not.toBeNull();
  });
});
