/**
 * M5 acceptance tests: Forms/@bind — InputBase family inside EditForm with
 * function-based validation, in happy-dom. Covers binding, validation
 * errors, and submit flows.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ComponentBase,
  EditContext,
  EditForm,
  EventCallback,
  InputCheckbox,
  InputDate,
  InputNumber,
  InputSelect,
  InputText,
  ValidationMessage,
  ValidationSummary,
  defineComponent,
  type RenderTreeBuilder,
} from "../src/index";
import {
  Renderer,
} from "../src/internal";
import { formatDateInput } from "../src/forms/input-text";

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
    b.addContent(4, (_context: EditContext) => (inner: RenderTreeBuilder) => {
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
      inner.addAttribute(20, "class", "mine");
      inner.addAttribute(21, "id", "summary");
      inner.closeComponent();
    });
    b.closeComponent();
  }
}

describe("EditForm + Input* components", () => {
  it("binds DOM input changes to the model through ValueChanged", async () => {
    const { renderer, page } = await render();
    const input = document.querySelector("input") as HTMLInputElement;

    input.value = "hello@tsazor.dev";
    input.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();

    expect(page().model.email).toBe("hello@tsazor.dev");
  });

  it("shows validation messages and invalid classes after a failed edit", async () => {
    const { renderer, page } = await render();
    const input = document.querySelector("input") as HTMLInputElement;

    input.value = "not-an-email";
    input.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();

    const message = document.querySelector("span.validation-message");
    expect(message?.textContent).toBe("Email must contain @");
    // Blazor's EditContext.FieldCssClass: modified + invalid ⇒ "modified invalid".
    expect(input.className).toBe("modified invalid");
    // Blazor's InputBase: aria-invalid="true" while the field has messages.
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(page().model.email).toBe("not-an-email");

    input.value = "me@tsazor.dev";
    input.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();

    expect(document.querySelector("span.validation-message")).toBeNull();
    expect(input.className).toBe("modified valid");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
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
    // Blazor's markup: its class replaces a passed one, the other attributes pass through.
    const summary = document.querySelector("ul#summary")!;
    expect(summary.getAttribute("class")).toBe("validation-errors");
    expect([...summary.children].every((li) => li.tagName === "LI" && li.className === "validation-message")).toBe(true);
    const items = [...summary.children].map((li) => li.textContent);
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
    expect(document.querySelector("ul.validation-errors")).toBeNull();
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

describe("an input's validation attributes (Blazor's UpdateAdditionalValidationAttributes and CssClass)", () => {
  /** Blazor's "custom input" idiom: inherit an input, render your own markup with the attributes and CssClass. */
  class LiveText extends InputText {
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      b.openElement(0, "input");
      b.addMultipleAttributes(1, this.attributesWithValidation);
      b.addAttribute(2, "class", this.cssClass);
      b.addAttribute(3, "value", this.currentValue ?? "");
      b.addEventHandler(4, "oninput", EventCallback.bind(this, (e: Event) => { this.currentValue = (e.target as HTMLInputElement).value; }));
      b.closeElement();
    }
  }

  it("puts aria-invalid into the attributes while the field has messages — a caller's own then, none while valid", async () => {
    const model = { name: "", code: "" };
    class Page extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(EditForm));
        b.addAttribute(1, "Model", model);
        b.addAttribute(2, "Validators", { name: (v: unknown) => (v ? null : "Required"), code: (v: unknown) => (v === "ok" ? null : "Wrong") });
        b.addContent(3, () => (inner: RenderTreeBuilder) => {
          inner.openComponent(0, defineComponent(LiveText));
          inner.addAttribute(1, "Value", model.name);
          inner.addAttribute(2, "ValueChanged", EventCallback.bind(this, (v: string) => { model.name = v; }));
          inner.addAttribute(3, "ValueExpression", "name");
          inner.addAttribute(4, "class", "field");
          inner.closeComponent();
          inner.openComponent(5, defineComponent(InputText));
          inner.addAttribute(6, "Value", model.code);
          inner.addAttribute(7, "ValueChanged", EventCallback.bind(this, (v: string) => { model.code = v; }));
          inner.addAttribute(8, "ValueExpression", "code");
          inner.addAttribute(9, "aria-invalid", "grammar");
          inner.closeComponent();
        });
        b.closeComponent();
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    renderer.renderInContainer(Page, container);
    await renderer.waitUntilIdle();
    const [live, code] = [...container.querySelectorAll("input")];
    expect(live!.hasAttribute("aria-invalid")).toBe(false);
    // A valid field carries no aria-invalid — Blazor drops even the caller's then.
    expect(code!.hasAttribute("aria-invalid")).toBe(false);

    container.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await renderer.waitUntilIdle();
    // The markup subclass gets the state through attributesWithValidation and cssClass, as Blazor's custom inputs do.
    expect(live!.getAttribute("aria-invalid")).toBe("true");
    expect(live!.className).toBe("field invalid");
    expect(code!.getAttribute("aria-invalid")).toBe("grammar");

    live!.value = "Ada";
    live!.dispatchEvent(new Event("input"));
    code!.value = "ok";
    code!.dispatchEvent(new Event("change"));
    await renderer.waitUntilIdle();
    expect(live!.hasAttribute("aria-invalid")).toBe(false);
    expect(live!.className).toBe("field modified valid");
    // Valid: no aria-invalid, not even the caller's (Blazor removes it too).
    expect(code!.hasAttribute("aria-invalid")).toBe(false);
  });
});

describe("InputDate (Blazor's InputDateType) and InputNumber with null", () => {
  /** Mounts one input bound to `value` and returns the element and what it reported. */
  async function mountInput(component: unknown, value: unknown, extra: Record<string, unknown> = {}) {
    const changes: unknown[] = [];
    class Host extends ComponentBase {
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.openComponent(0, defineComponent(component as never));
        b.addAttribute(1, "Value", value as never);
        b.addAttribute(2, "ValueChanged", EventCallback.unbound((next: unknown) => void changes.push(next)) as never);
        let seq = 3;
        for (const [name, attribute] of Object.entries(extra)) b.addAttribute(seq++, name, attribute as never);
        b.closeComponent();
      }
    }
    const container = document.createElement("div");
    document.body.appendChild(container);
    const renderer = new Renderer();
    renderer.renderInContainer(Host, container);
    await renderer.waitUntilIdle();
    const input = container.querySelector("input")!;
    const change = async (text: string) => {
      input.value = text;
      input.dispatchEvent(new Event("change"));
      await renderer.waitUntilIdle();
    };
    return { input, changes, change, remove: () => container.remove() };
  }

  it("writes a Date in local time for each type, not shifted through UTC", async () => {
    // 00:30 local on Oct 8: as UTC it's Oct 7 in any zone east of Greenwich.
    const value = new Date(2026, 9, 8, 0, 30, 5);
    expect((["date", "datetime-local", "month", "time"] as const).map((type) => formatDateInput(value, type))).toEqual([
      "2026-10-08",
      "2026-10-08T00:30:05",
      "2026-10",
      "00:30:05",
    ]);
    // In the DOM (happy-dom drops seconds the default step doesn't show; browsers keep them).
    const written: string[] = [];
    for (const type of ["date", "datetime-local", "month", "time"]) {
      const { input, remove } = await mountInput(InputDate, value, { type });
      written.push(`${input.type}=${input.value.slice(0, 16)}`);
      remove();
    }
    expect(written).toEqual(["date=2026-10-08", "datetime-local=2026-10-08T00:30", "month=2026-10", "time=00:30"]);
  });

  it("reads a Date back in local time; a bound string stays a string, a time is text", async () => {
    const date = await mountInput(InputDate, null, { type: "datetime-local" });
    await date.change("2026-10-08T07:45");
    expect((date.changes[0] as Date).getTime()).toBe(new Date(2026, 9, 8, 7, 45).getTime());
    date.remove();
    const text = await mountInput(InputDate, "2026-01-01");
    await text.change("2026-10-08");
    expect(text.changes).toEqual(["2026-10-08"]);
    text.remove();
    const time = await mountInput(InputDate, null, { type: "time" });
    await time.change("07:45");
    expect(time.changes).toEqual(["07:45"]);
    time.remove();
  });

  it("holds the rendered input as element (Blazor's Element), to focus it", async () => {
    for (const component of [InputText, InputNumber, InputCheckbox, InputDate, InputSelect]) {
      let instance: { element?: HTMLElement } | undefined;
      class Host extends ComponentBase {
        protected override buildRenderTree(b: RenderTreeBuilder): void {
          b.openComponent(0, defineComponent(component as never));
          b.addAttribute(1, "Value", "" as never);
          b.addComponentReferenceCapture(2, (captured) => {
            instance = captured as never;
          });
          b.closeComponent();
        }
      }
      const container = document.createElement("div");
      document.body.appendChild(container);
      const renderer = new Renderer();
      renderer.renderInContainer(Host, container);
      await renderer.waitUntilIdle();
      const rendered = container.querySelector("input, select");
      expect(instance?.element).toBe(rendered);
      instance!.element!.focus();
      expect(document.activeElement).toBe(rendered);
      container.remove();
    }
  });

  it("shows a null number as an empty input, not \"null\"", async () => {
    const { input, remove } = await mountInput(InputNumber, null);
    expect(input.value).toBe("");
    remove();
  });
});
