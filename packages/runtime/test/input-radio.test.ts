/**
 * Blazor's InputRadioGroup<TValue> and InputRadio<TValue>: the group binds one value, the radio whose value equals
 * it is checked, choosing a radio writes its value back — typed, not as text — and the radios render again when the
 * group's value changes. A radio without a group throws; a radio can name an enclosing group.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, EventCallback, InputRadio, InputRadioGroup, defineComponent, type RenderTreeBuilder } from "../src/index";
import { Renderer } from "../src/internal";

enum Size {
  Small = 1,
  Large = 2,
}

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(component: new () => ComponentBase): Promise<Renderer> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  renderer.renderInContainer(component, container);
  await renderer.waitUntilIdle();
  return renderer;
}

const radios = (): HTMLInputElement[] => [...document.querySelectorAll<HTMLInputElement>("input[type=radio]")];

describe("InputRadioGroup / InputRadio", () => {
  it("checks the radio of the group's value; choosing one writes its typed value back and moves the check", async () => {
    let page: SizePage | undefined;
    class SizePage extends ComponentBase {
      size = Size.Large;
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        page = this;
        b.openComponent(0, defineComponent(InputRadioGroup));
        b.addAttribute(1, "Value", this.size);
        b.addAttribute(2, "ValueChanged", EventCallback.bind(this, (value: Size) => {
          this.size = value;
        }));
        b.addAttribute(3, "ChildContent", (inner: RenderTreeBuilder) => {
          inner.openComponent(0, defineComponent(InputRadio));
          inner.addAttribute(1, "Value", Size.Small);
          inner.closeComponent();
          inner.openComponent(2, defineComponent(InputRadio));
          inner.addAttribute(3, "Value", Size.Large);
          inner.addAttribute(4, "class", "big");
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    const renderer = await mount(SizePage);
    const [small, large] = radios();
    expect([small!.checked, large!.checked]).toEqual([false, true]);
    expect(small!.name).toBe(large!.name);
    expect(small!.name).not.toBe("");
    expect([small!.value, large!.value]).toEqual(["1", "2"]);
    expect(large!.className).toBe("big");

    small!.checked = true;
    small!.dispatchEvent(new Event("change", { bubbles: true }));
    await renderer.waitUntilIdle();
    expect(page!.size).toBe(Size.Small);
    expect(typeof page!.size).toBe("number");
    expect([radios()[0]!.checked, radios()[1]!.checked]).toEqual([true, false]);
  });

  it("an unbound group shows the choice itself", async () => {
    class Unbound extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(InputRadioGroup));
        b.addAttribute(1, "Name", "pick");
        b.addAttribute(2, "ChildContent", (inner: RenderTreeBuilder) => {
          inner.openComponent(0, defineComponent(InputRadio));
          inner.addAttribute(1, "Value", "a");
          inner.closeComponent();
          inner.openComponent(2, defineComponent(InputRadio));
          inner.addAttribute(3, "Value", "b");
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    const renderer = await mount(Unbound);
    expect(radios().map((radio) => radio.name)).toEqual(["pick", "pick"]);
    radios()[1]!.checked = true;
    radios()[1]!.dispatchEvent(new Event("change", { bubbles: true }));
    await renderer.waitUntilIdle();
    expect(radios().map((radio) => radio.checked)).toEqual([false, true]);
  });

  it("a radio without a group throws Blazor's message; one inside a nested group names the outer group", async () => {
    class Lonely extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(InputRadio));
        b.addAttribute(1, "Value", 1);
        b.closeComponent();
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    const errors: { error: unknown }[] = [];
    renderer.errorHandler = (error) => errors.push(error);
    renderer.renderInContainer(Lonely, container);
    await renderer.waitUntilIdle();
    expect(String(errors[0]?.error)).toContain("InputRadio must have an InputRadioGroup ancestor.");

    let outer = "";
    class Nested extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(InputRadioGroup));
        b.addAttribute(1, "Name", "outer");
        b.addAttribute(2, "Value", "x");
        b.addAttribute(3, "ValueChanged", EventCallback.bind(this, (value: string) => {
          outer = value;
        }));
        b.addAttribute(4, "ChildContent", (inner: RenderTreeBuilder) => {
          inner.openComponent(0, defineComponent(InputRadioGroup));
          inner.addAttribute(1, "Name", "inner");
          inner.addAttribute(2, "ChildContent", (innermost: RenderTreeBuilder) => {
            innermost.openComponent(0, defineComponent(InputRadio));
            innermost.addAttribute(1, "Name", "outer");
            innermost.addAttribute(2, "Value", "y");
            innermost.closeComponent();
          });
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    document.body.innerHTML = "";
    const nested = await mount(Nested);
    const [radio] = radios();
    expect(radio!.name).toBe("outer");
    radio!.checked = true;
    radio!.dispatchEvent(new Event("change", { bubbles: true }));
    await nested.waitUntilIdle();
    expect(outer).toBe("y");
  });
});
