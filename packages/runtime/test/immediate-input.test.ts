/**
 * F15: InputText / InputTextArea with `immediate` (MudBlazor's `Immediate`, react-hook-form's `register()`): the
 * value binds on every keystroke, the form hears of the field change on `change` — and, while the field has a
 * message, on every keystroke, so the message goes as soon as the value is fixed.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ComponentBase,
  EditForm,
  EventCallback,
  InputText,
  InputTextArea,
  ValidationMessage,
  defineComponent,
  type EditContext,
  type RenderTreeBuilder,
} from "../src/index";
import {
  Renderer,
} from "../src/internal";

let current: NamePage | undefined;

/** An EditForm with one required field, bound with or without `immediate`. */
class NamePage extends ComponentBase {
  static input: typeof InputText | typeof InputTextArea = InputText;
  static immediate = true;
  model = { name: "" };
  changes = 0;

  protected override onInitialized(): void {
    current = this;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(EditForm));
    b.addAttribute(1, "Model", this.model);
    b.addAttribute(2, "Validators", { name: (v: unknown) => (typeof v === "string" && v.length >= 3 ? null : "At least 3 characters") });
    b.addContent(3, (_context: EditContext) => (inner: RenderTreeBuilder) => {
      inner.openComponent(0, defineComponent(NamePage.input));
      inner.addAttribute(1, "Value", this.model.name);
      inner.addAttribute(
        2,
        "ValueChanged",
        EventCallback.bind(this, (v: string) => {
          this.model.name = v;
          this.changes++;
        }),
      );
      inner.addAttribute(3, "ValueExpression", "name");
      if (NamePage.immediate) inner.addAttribute(4, "immediate", true);
      inner.closeComponent();
      inner.openComponent(5, defineComponent(ValidationMessage));
      inner.addAttribute(6, "For", "name");
      inner.closeComponent();
    });
    b.closeComponent();
  }
}

async function render(input: typeof InputText | typeof InputTextArea, immediate: boolean) {
  NamePage.input = input;
  NamePage.immediate = immediate;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  renderer.renderInContainer(NamePage, container);
  await renderer.waitUntilIdle();
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")!;
  const type = async (value: string, event: "input" | "change") => {
    field.value = value;
    field.dispatchEvent(new Event(event));
    await renderer.waitUntilIdle();
  };
  const message = () => container.querySelector(".validation-message")?.textContent ?? null;
  return { field, type, message, page: () => current! };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe.each([
  ["InputText", InputText],
  ["InputTextArea", InputTextArea],
])("%s immediate (F15)", (_name, input) => {
  it("binds per keystroke, validates on change, and re-validates per keystroke while invalid", async () => {
    const { field, type, message, page } = await render(input, true);
    await type("A", "input");
    expect(page().model.name).toBe("A");
    expect(message()).toBeNull(); // no message while typing a fresh field
    expect(field.className).toBe("valid");

    await type("A", "change");
    expect(message()).toBe("At least 3 characters");
    expect(field.className).toBe("modified invalid");

    await type("Ad", "input");
    expect([page().model.name, message()]).toEqual(["Ad", "At least 3 characters"]);
    await type("Ada", "input");
    expect([page().model.name, message()]).toEqual(["Ada", null]); // gone at the keystroke that fixes it
    expect(field.className).toBe("modified valid");

    await type("Ada", "change");
    expect(page().changes).toBe(3); // one ValueChanged per new value; the change with the same value adds none
    expect(message()).toBeNull();
  });

  it("without it binds on change only, as Blazor's", async () => {
    const { type, page } = await render(input, false);
    await type("A", "input");
    expect(page().model.name).toBe("");
    await type("A", "change");
    expect(page().model.name).toBe("A");
  });
});
