/**
 * M5 acceptance tests: Forms/@bind — InputBase family inside EditForm with
 * function-based validation, in happy-dom. Covers binding, validation
 * errors, and submit flows.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ComponentBase,
  EditForm,
  EventCallback,
  InputCheckbox,
  InputNumber,
  InputSelect,
  InputText,
  Renderer,
  ValidationMessage,
  ValidationSummary,
  defineComponent,
  type RenderTreeBuilder,
} from "../src/index";

/** The form demo page: EditForm with validators, three bound inputs. */
class ContactFormPage extends ComponentBase {
  model = { email: "", age: 0, agree: false, topic: "" };
  submitted = false;

  protected override onInitialized(): void {
    currentInstance = this;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(EditForm));
    b.addAttribute(1, "Model", this.model);
    b.addAttribute(2, "Validators", {
      email: (v: unknown) => (typeof v === "string" && v.includes("@") ? null : "Email must contain @"),
      age: (v: unknown) => (typeof v === "number" && v >= 18 ? null : "Must be 18 or older"),
      topic: (v: unknown) => (typeof v === "string" && v !== "" ? null : "Pick a topic"),
    });
    b.addAttribute(
      3,
      "OnValidSubmit",
      EventCallback.bind(this, () => {
        this.submitted = true;
      }),
    );
    b.addContent(4, (inner: RenderTreeBuilder) => {
      inner.openComponent(0, defineComponent(InputText));
      inner.addAttribute(1, "Value", this.model.email);
      inner.addAttribute(
        2,
        "ValueChanged",
        EventCallback.bind(this, (v: string) => {
          this.model.email = v;
        }),
      );
      inner.addAttribute(3, "ValueExpression", "email");
      inner.closeComponent();
      inner.openComponent(4, defineComponent(ValidationMessage));
      inner.addAttribute(5, "For", "email");
      inner.closeComponent();
      inner.openComponent(6, defineComponent(InputNumber));
      inner.addAttribute(7, "Value", this.model.age);
      inner.addAttribute(
        8,
        "ValueChanged",
        EventCallback.bind(this, (v: number | string) => {
          this.model.age = typeof v === "number" ? v : this.model.age;
        }),
      );
      inner.addAttribute(9, "ValueExpression", "age");
      inner.closeComponent();
      inner.openComponent(10, defineComponent(InputSelect));
      inner.addAttribute(11, "Value", this.model.topic);
      inner.addAttribute(
        12,
        "ValueChanged",
        EventCallback.bind(this, (v: string) => {
          this.model.topic = v;
        }),
      );
      inner.addAttribute(13, "ValueExpression", "topic");
      inner.addContent(14, (sel: RenderTreeBuilder) => {
        sel.openElement(0, "option");
        sel.addAttribute(1, "value", "support");
        sel.addContent(2, "Support");
        sel.closeElement();
        sel.openElement(3, "option");
        sel.addAttribute(4, "value", "sales");
        sel.addContent(5, "Sales");
        sel.closeElement();
      });
      inner.closeComponent();
      inner.openComponent(15, defineComponent(InputCheckbox));
      inner.addAttribute(16, "Value", this.model.agree);
      inner.addAttribute(
        17,
        "ValueChanged",
        EventCallback.bind(this, (v: boolean) => {
          this.model.agree = v;
        }),
      );
      inner.addAttribute(18, "ValueExpression", "agree");
      inner.closeComponent();
      inner.openComponent(19, defineComponent(ValidationSummary));
      inner.closeComponent();
    });
    b.closeComponent();
  }
}

describe("EditForm + Input* components", () => {
  it("binds DOM input changes to the model through ValueChanged", async () => {
    const { renderer, page } = await render();
    const input = document.querySelector("input") as HTMLInputElement;

    input.value = "hello@tasor.dev";
    input.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();

    expect(page().model.email).toBe("hello@tasor.dev");
  });

  it("shows validation messages and invalid classes after a failed edit", async () => {
    const { renderer, page } = await render();
    const input = document.querySelector("input") as HTMLInputElement;

    input.value = "not-an-email";
    input.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();

    const message = document.querySelector("span.validation-message");
    expect(message?.textContent).toBe("Email must contain @");
    expect(input.className).toBe("invalid");
    expect(page().model.email).toBe("not-an-email");

    input.value = "me@tasor.dev";
    input.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();

    expect(document.querySelector("span.validation-message")).toBeNull();
    expect(input.className).toBe("modified valid");
  });

  it("coerces number and checkbox values", async () => {
    const { renderer, page } = await render();
    const inputs = [...document.querySelectorAll("input")];
    const age = inputs[1] as HTMLInputElement;
    const agree = inputs[2] as HTMLInputElement;

    age.value = "17";
    age.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    expect(page().model.age).toBe(17);

    agree.checked = true;
    agree.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    expect(page().model.agree).toBe(true);

    const select = document.querySelector("select") as HTMLSelectElement;
    select.value = "sales";
    select.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    expect(page().model.topic).toBe("sales");
  });

  it("blocks submit while invalid and shows the summary, then submits when valid", async () => {
    const { renderer, page } = await render();
    const page0 = page;

    const form = document.querySelector("form") as HTMLFormElement;
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await renderer.waitUntilIdle();

    expect(page0().submitted).toBe(false);
    const items = [...document.querySelectorAll("ul.validation-summary li")].map((li) => li.textContent);
    expect(items).toContain("Email must contain @");
    expect(items).toContain("Must be 18 or older");
    expect(items).toContain("Pick a topic");

    // Fix all fields.
    const inputs = [...document.querySelectorAll("input")];
    const email = inputs[0] as HTMLInputElement;
    const age = inputs[1] as HTMLInputElement;
    const agree = inputs[2] as HTMLInputElement;
    const select = document.querySelector("select") as HTMLSelectElement;

    email.value = "x@y.dev";
    email.dispatchEvent(new Event("change"));
    age.value = "42";
    age.dispatchEvent(new Event("change"));
    agree.checked = true;
    agree.dispatchEvent(new Event("change"));
    select.value = "sales";
    select.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();

    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await renderer.waitUntilIdle();

    expect(page0().submitted).toBe(true);
    expect(document.querySelector("ul.validation-summary")).toBeNull();
  });

  it("does not navigate on submit (preventDefault)", async () => {
    const { renderer } = await render();
    const form = document.querySelector("form") as HTMLFormElement;
    const event = new Event("submit", { cancelable: true });
    form.dispatchEvent(event);
    await renderer.waitUntilIdle();
    expect(event.defaultPrevented).toBe(true);
  });
});

let currentInstance: ContactFormPage | null = null;

async function render(): Promise<{ renderer: Renderer; page: () => ContactFormPage }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  renderer.renderInContainer(ContactFormPage, container);
  await renderer.waitUntilIdle();
  return { renderer, page: () => currentInstance! };
}

afterEach(() => {
  document.body.innerHTML = "";
});