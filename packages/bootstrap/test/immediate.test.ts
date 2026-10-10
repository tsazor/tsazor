/**
 * Fluent UI Blazor's `Immediate` on TextInput and TextArea: the bound value follows the typing once it pauses for
 * `immediateDelay` ms; without it the value waits for `change`. Typing never loses keys to a render.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { TextArea, TextInput } from "../dist/index.js";

const hosts: RenderResult[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

/** A page that binds `query` to the field, as `@bind-Value="query"` does. */
function hostOf(field: unknown, immediate: boolean) {
  return class Host extends ComponentBase {
    static last: Host | undefined;
    query = "";
    renders = 0;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      Host.last = this;
      this.renders++;
      b.openComponent(0, field as never);
      b.addAttribute(1, "value", this.query);
      b.addAttribute(2, "valueChanged", EventCallback.bind(this, (value: string) => {
        this.query = value;
      }));
      b.addAttribute(3, "ariaLabel", "Search");
      b.addAttribute(4, "immediate", immediate);
      b.addAttribute(5, "immediateDelay", 30);
      b.closeComponent();
    }
  };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function type(result: RenderResult, selector: string, text: string, eventName = "input"): Promise<HTMLInputElement> {
  const field = result.container.querySelector<HTMLInputElement>(selector)!;
  field.value = text;
  field.dispatchEvent(new Event(eventName, { bubbles: true }));
  await result.renderer.waitUntilIdle();
  return field;
}

for (const [field, selector] of [[TextInput, "input"], [TextArea, "textarea"]] as const) {
  describe(`${selector === "input" ? "TextInput" : "TextArea"} immediate`, () => {
    it("follows the typing once it pauses, one update for a burst, keeping every key", async () => {
      const Host = hostOf(field, true);
      const result = await render(Host);
      hosts.push(result);
      await type(result, selector, "s");
      await type(result, selector, "sa");
      const input = await type(result, selector, "sav");
      expect(Host.last!.query).toBe("");
      expect(input.value).toBe("sav");
      const before = Host.last!.renders;
      await pause(60);
      await result.renderer.waitUntilIdle();
      expect(Host.last!.query).toBe("sav");
      expect(Host.last!.renders).toBe(before + 1);
      expect(input.value).toBe("sav");
    });

    it("without it, the value waits for change", async () => {
      const Host = hostOf(field, false);
      const result = await render(Host);
      hosts.push(result);
      const input = await type(result, selector, "sav");
      await pause(60);
      expect(Host.last!.query).toBe("");
      expect(input.value).toBe("sav");
      await type(result, selector, "save", "change");
      expect(Host.last!.query).toBe("save");
    });
  });
}
