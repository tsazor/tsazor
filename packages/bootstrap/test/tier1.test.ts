/**
 * The rest of Tier 1, shared with @tsazor/fluent (the same test runs there with
 * that skin's selectors): ButtonGroup, DateInput, FileInput, FormField,
 * Skeleton, Popover.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { CascadingValue, EditContext, EventCallback, ValidationMessageStore, type RenderFragment } from "@tsazor/runtime";
import { markSubmitAttempt } from "@tsazor/ui";
import { Button, ButtonGroup, DateInput, FileInput, FormField, Popover, Skeleton } from "../dist/index.js";

const SKIN = {
  popover: ".popover",
  popoverClose: ".btn-close",
  message: ".invalid-feedback",
  help: ".form-text",
};

const text = (content: string): RenderFragment => (b) => b.addContent(0, content);

type Renderer = Awaited<ReturnType<typeof renderTree>>["renderer"];
async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

beforeAll(() => {
  document.body.innerHTML = "";
});

describe("ButtonGroup", () => {
  it("is a named group of buttons", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, ButtonGroup);
      b.addAttribute(1, "ariaLabel", "Text alignment");
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        for (const [seq, label] of [[0, "Left"], [2, "Center"]] as const) {
          inner.openComponent(seq, Button);
          inner.addAttribute(seq + 1, "childContent", text(label));
          inner.closeComponent();
        }
      });
      b.closeComponent();
    });
    const group = container.querySelector("[role=group]")!;
    expect(group.getAttribute("aria-label")).toBe("Text alignment");
    expect([...group.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["Left", "Center"]);
  });
});

describe("DateInput", () => {
  it("binds the ISO date text and keeps min and max", async () => {
    const values: string[] = [];
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, DateInput);
      b.addAttribute(1, "label", "Delivery");
      b.addAttribute(2, "value", "2026-10-07");
      b.addAttribute(3, "min", "2026-10-01");
      b.addAttribute(4, "valueChanged", EventCallback.unbound((value: string) => {
        values.push(value);
      }));
      b.closeComponent();
    });
    const input = container.querySelector<HTMLInputElement>("input[type=date]")!;
    expect(input.value).toBe("2026-10-07");
    expect(input.getAttribute("min")).toBe("2026-10-01");
    expect(container.querySelector(`label[for="${input.id}"]`)!.textContent).toBe("Delivery");
    input.value = "2026-10-09";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(values).toEqual(["2026-10-09"]);
  });
});

describe("FileInput", () => {
  it("labels the runtime's file input and links its help text", async () => {
    const { container } = await renderTree((b) => {
      b.openComponent(0, FileInput);
      b.addAttribute(1, "label", "Order list");
      b.addAttribute(2, "accept", ".csv");
      b.addAttribute(3, "help", "One order per line.");
      b.addAttribute(4, "multiple", true);
      b.closeComponent();
    });
    const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
    expect(container.querySelector(`label[for="${input.id}"]`)!.textContent).toBe("Order list");
    expect(input.getAttribute("accept")).toBe(".csv");
    expect(input.multiple).toBe(true);
    expect(document.getElementById(input.getAttribute("aria-describedby")!)!.textContent).toBe("One order per line.");
  });
});

describe("FormField", () => {
  it("labels a control of your own and shows the field's message after a submit attempt", async () => {
    const model = { color: "" };
    const context = new EditContext(model);
    const store = new ValidationMessageStore(context);
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, CascadingValue);
      b.addAttribute(1, "value", context);
      b.addAttribute(2, "childContent", (inner: typeof b) => {
        inner.openComponent(0, FormField);
        inner.addAttribute(1, "label", "Color");
        inner.addAttribute(2, "id", "color-picker");
        inner.addAttribute(3, "for", "color");
        inner.addAttribute(4, "help", "The bag's color.");
        inner.addAttribute(5, "childContent", (control: typeof b) => {
          control.openElement(0, "input");
          control.addAttribute(1, "id", "color-picker");
          control.closeElement();
        });
        inner.closeComponent();
      });
      b.closeComponent();
    });
    expect(container.querySelector("label[for=color-picker]")!.textContent).toBe("Color");
    expect(container.querySelector(`#color-picker-help`)!.textContent).toBe("The bag's color.");
    store.add("color", "Pick a color.");
    context.notifyValidationStateChanged();
    await settle(renderer);
    expect(container.querySelector(SKIN.message)).toBeNull();
    markSubmitAttempt(context);
    context.notifyValidationStateChanged();
    await settle(renderer);
    expect(container.querySelector("#color-picker-message")!.textContent).toBe("Pick a color.");
  });
});

describe("Skeleton", () => {
  it("draws lines or a shape, hidden from screen readers", async () => {
    const lines = await renderTree((b) => {
      b.openComponent(0, Skeleton);
      b.addAttribute(1, "lines", 2);
      b.closeComponent();
    });
    const root = lines.container.firstElementChild!;
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(root.children).toHaveLength(2);
    const circle = await renderTree((b) => {
      b.openComponent(0, Skeleton);
      b.addAttribute(1, "shape", "circle");
      b.addAttribute(2, "width", "40px");
      b.closeComponent();
    });
    const shape = circle.container.querySelector("[style]") as HTMLElement;
    expect(shape.style.width).toBe("40px");
    expect(shape.style.height).toBe("40px");
  });
});

describe("Popover", () => {
  it("opens a dialog labelled by its title, takes focus, and Escape returns it to the button", async () => {
    const { container, renderer } = await renderTree((b) => {
      b.openComponent(0, Popover);
      b.addAttribute(1, "label", "Details");
      b.addAttribute(2, "title", "Order 101");
      b.addAttribute(3, "childContent", text("Two sourdough loaves."));
      b.closeComponent();
    });
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    button.click();
    await settle(renderer);
    const dialog = container.querySelector<HTMLElement>(SKIN.popover)!;
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(document.getElementById(dialog.getAttribute("aria-labelledby")!)!.textContent).toBe("Order 101");
    expect(button.getAttribute("aria-controls")).toBe(dialog.id);
    expect(document.activeElement).toBe(dialog);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle(renderer);
    expect(container.querySelector(SKIN.popover)).toBeNull();
    expect(document.activeElement).toBe(button);

    button.click();
    await settle(renderer);
    container.querySelector<HTMLButtonElement>(`${SKIN.popover} ${SKIN.popoverClose}`)!.click();
    await settle(renderer);
    expect(container.querySelector(SKIN.popover)).toBeNull();
  });
});
