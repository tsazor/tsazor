/**
 * Input-family tests: fluent inputs inside a FluentForm exercise the runtime
 * InputBase/EditContext integration (fieldClass merge, validation rows, bind
 * round-trip) through the compiled dist pipeline.
 */
import { afterAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback, type EditContext, type RenderTreeBuilder } from "@tsazor/runtime";
import {
  Checkbox,
  FluentForm,
  NumberInput,
  Select,
  Switch,
  TextArea,
  TextInput,
} from "../dist/index.js";

/** The renderer type returned by renderTree. */
type Renderer = Pick<Awaited<ReturnType<typeof renderTree>>, "settle">;

/** Waits out the microtask render queue plus the settle timer. */
async function settle(renderer: Renderer): Promise<void> {
  await renderer.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.settle();
}

/** The small contact model every form test binds to. */
interface ContactModel {
  name: string;
  age: number;
  topic: string;
  agree: boolean;
  notes: string;
}

/** A blank contact model for one test. */
function emptyModel(): ContactModel {
  return { name: "", age: 0, topic: "general", agree: false, notes: "" };
}

/** The validator record shared by the form tests (keys = field names). */
function formValidators(): Record<string, (value: unknown, model: unknown) => string | null> {
  return {
    name: (v: unknown) => (String(v ?? "").trim().length > 0 ? null : "Name is required."),
    age: (v: unknown) => (Number(v) >= 18 ? null : "Must be 18 or older."),
    topic: (v: unknown) => (String(v ?? "").length > 0 ? null : "Pick a topic."),
    agree: (v: unknown) => (v === true ? null : "Please confirm."),
    notes: () => null,
  };
}

/** Renders one FluentForm bound to `model`; `child` provides the fluent
 *  inputs inside the inner EditForm. */
async function renderForm(
  model: ContactModel,
  child: (b: RenderTreeBuilder) => void,
  onValidSubmit?: () => void,
): Promise<{ container: HTMLElement; renderer: Renderer }> {
  const { container, ...renderer } = await renderTree(b => {
    b.openComponent(0, FluentForm);
    b.addAttribute(1, "model", model);
    b.addAttribute(2, "validators", formValidators());
    if (onValidSubmit) {
      b.addAttribute(3, "onValidSubmit", EventCallback.unbound(onValidSubmit));
    }
    b.addAttribute(4, "childContent", ((ctx: EditContext) => (b: RenderTreeBuilder) => child(b)) as never);
    b.closeComponent();
  });
  await settle(renderer);
  return { container, renderer };
}

afterAll(() => {
  document.body.innerHTML = "";
});

describe("TextInput inside FluentForm", () => {
  it("renders label chrome, forwards placeholder, keeps the valid state quiet", async () => {
    const model = emptyModel();
    const { container } = await renderForm(model, b => {
      b.openComponent(0, TextInput);
      b.addAttribute(1, "value", model.name);
      b.addAttribute(2, "valueChanged", EventCallback.unbound((v: string) => { model.name = v; }));
      b.addAttribute(4, "valueExpression", "name");
      b.addAttribute(5, "label", "Name");
      b.addAttribute(6, "placeholder", "Your name");
      b.addAttribute(7, "id", "name-input");
      b.closeComponent();
    });
    const wrapper = container.querySelector(".fui-input-wrapper")!;
    const input = wrapper.querySelector("input")!;
    expect(input.getAttribute("placeholder")).toBe("Your name");
    expect(wrapper.querySelector(".fui-input__label")!.textContent).toBe("Name");
    expect(wrapper.querySelector(".fui-input__label")!.getAttribute("for")).toBe("name-input");
    expect(input.getAttribute("aria-describedby")).toBeNull();
    expect(wrapper.querySelector(".fui-input__message")).toBeNull();
    expect(input.className).toBe("fui-input");
  });

  it("binds, validates, and restores through the EditContext — the error row waits for the submit", async () => {
    const model = emptyModel();
    const { container, renderer } = await renderForm(model, b => {
      b.openComponent(0, TextInput);
      b.addAttribute(1, "value", model.name);
      b.addAttribute(2, "valueChanged", EventCallback.unbound((v: string) => { model.name = v; }));
      b.addAttribute(4, "valueExpression", "name");
      b.addAttribute(5, "id", "name-input");
      b.closeComponent();
    });
    const wrapper = container.querySelector(".fui-input-wrapper")!;
    const input = wrapper.querySelector("input")! as HTMLInputElement;
    const form = container.querySelector("form")!;

    // Invalid edit: the field marks itself — for a screen reader too — but the message row waits for a submit.
    input.value = "  ";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);

    expect(wrapper.querySelector(".fui-input__message")).toBeNull();
    expect(wrapper.className).toContain("fui-input-wrapper--invalid");
    expect(input.className).toContain("fui-input--invalid");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBeNull();

    // Submit: now the alert row appears (aria-describedby points at it, role="alert").
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle(renderer);
    const row = wrapper.querySelector(".fui-input__message")!;
    expect(row.textContent).toBe("Name is required.");
    expect(row.getAttribute("role")).toBe("alert");
    expect(row.id).toBe("name-input-message");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("name-input-message");

    // Valid edit: the row goes away, the field class flips to modified-valid.
    input.value = "Holger";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(wrapper.querySelector(".fui-input__message")).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeNull();
    expect(input.className).toBe("fui-input fui-input--valid");
    expect(model.name).toBe("Holger");
  });

  it("generates a stable id when the app gives none (label + message association)", async () => {
    const model = emptyModel();
    const { container } = await renderForm(model, b => {
      b.openComponent(0, TextInput);
      b.addAttribute(1, "label", "Street");
      b.addAttribute(4, "valueExpression", "name");
      b.closeComponent();
    });
    const wrapper = container.querySelector(".fui-input-wrapper")!;
    const input = wrapper.querySelector("input")!;
    expect(input.id).toMatch(/^fui-input-\d+/);
    expect(wrapper.querySelector(".fui-input__label")!.getAttribute("for")).toBe(input.id);
  });
});

describe("NumberInput inside FluentForm", () => {
  it("parses numeric edits through the bind chain", async () => {
    const model = emptyModel();
    const { container, renderer } = await renderForm(model, b => {
      b.openComponent(0, NumberInput);
      b.addAttribute(1, "value", model.age);
      b.addAttribute(2, "valueChanged", EventCallback.unbound((v: number) => { model.age = v; }));
      b.addAttribute(4, "valueExpression", "age");
      b.addAttribute(5, "label", "Age");
      b.closeComponent();
    });
    const input = container.querySelector("input")! as HTMLInputElement;
    expect(input.type).toBe("number");

    input.value = "42";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(model.age).toBe(42);
    expect(container.querySelector(".fui-input--invalid")).toBeNull();
  });
});

describe("Switch", () => {
  it("toggles through the role=switch native control", async () => {
    const captured: boolean[] = [];
    const { container, ...renderer } = await renderTree(b => {
      b.openComponent(0, Switch);
      b.addAttribute(1, "label", "Auto theme");
      b.addAttribute(2, "value", false);
      b.addAttribute(3, "valueChanged", EventCallback.unbound((v: boolean) => captured.push(v)));
      b.closeComponent();
    });
    const input = container.querySelector("input")! as HTMLInputElement;
    expect(input.getAttribute("role")).toBe("switch");
    expect(container.querySelector(".fui-switch__label")!.textContent).toBe("Auto theme");

    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(captured.at(-1)).toBe(true);
    expect(input.checked).toBe(true);
  });
});

describe("Checkbox inside FluentForm", () => {
  it("toggles, labels its association, and merges the modified-valid class", async () => {
    const model = emptyModel();
    const { container, renderer } = await renderForm(model, b => {
      b.openComponent(0, Checkbox);
      b.addAttribute(1, "label", "Confirm purchase");
      b.addAttribute(2, "id", "agree-box");
      b.addAttribute(3, "value", model.agree);
      b.addAttribute(4, "valueChanged", EventCallback.unbound((v: boolean) => { model.agree = v; }));
      b.addAttribute(6, "valueExpression", "agree");
      b.closeComponent();
    });
    const input = container.querySelector("input")! as HTMLInputElement;
    const label = container.querySelector(".fui-checkbox__label")!;
    expect(label.textContent).toBe("Confirm purchase");
    expect(label.getAttribute("for")).toBe("agree-box");

    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".fui-checkbox")!.className).toContain("fui-checkbox--valid");
    expect(model.agree).toBe(true);
  });
});

describe("Select inside FluentForm", () => {
  it("renders options and round-trips the selected value", async () => {
    const model = emptyModel();
    const { container, renderer } = await renderForm(model, b => {
      b.openComponent(0, Select);
      b.addAttribute(1, "label", "Topic");
      b.addAttribute(2, "value", model.topic);
      b.addAttribute(3, "valueChanged", EventCallback.unbound((v: string) => { model.topic = v; }));
      b.addAttribute(5, "valueExpression", "topic");
      b.addAttribute(
        6,
        "childContent",
        (sel: RenderTreeBuilder) => {
          sel.openElement(0, "option");
          sel.addAttribute(1, "value", "general");
          sel.addContent(2, "General");
          sel.closeElement();
          sel.openElement(3, "option");
          sel.addAttribute(4, "value", "sales");
          sel.addContent(5, "Sales");
          sel.closeElement();
        },
      );
      b.closeComponent();
    });
    const selectEl = container.querySelector("select")!;
    const options = [...selectEl.querySelectorAll("option")];
    expect(options.map(o => o.textContent)).toEqual(["General", "Sales"]);
    expect(options.map(o => o.getAttribute("value"))).toEqual(["general", "sales"]);

    selectEl.value = "sales";
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(model.topic).toBe("sales");
  });
});

describe("TextArea inside FluentForm", () => {
  it("renders rows and round-trips via onchange", async () => {
    const model = emptyModel();
    const { container, renderer } = await renderForm(model, b => {
      b.openComponent(0, TextArea);
      b.addAttribute(1, "label", "Notes");
      b.addAttribute(2, "rows", 4);
      b.addAttribute(3, "value", model.notes);
      b.addAttribute(4, "valueChanged", EventCallback.unbound((v: string) => { model.notes = v; }));
      b.addAttribute(6, "valueExpression", "notes");
      b.closeComponent();
    });
    const el = container.querySelector("textarea")! as HTMLTextAreaElement;
    expect(el.getAttribute("rows")).toBe("4");
    el.value = "Hello notes";
    el.dispatchEvent(new Event("change", { bubbles: true }));
    await settle(renderer);
    expect(model.notes).toBe("Hello notes");
  });
});

describe("FluentForm submit flow", () => {
  it("is novalidate: the browser's own check doesn't block EditForm's validation", async () => {
    const { container } = await renderForm(emptyModel(), () => {});
    expect(container.querySelector("form")!.hasAttribute("novalidate")).toBe(true);
  });

  it("blocks an invalid submit and fires onValidSubmit once valid", async () => {
    const model = emptyModel();
    let submitted = 0;
    const { container, renderer } = await renderForm(
      model,
      b => {
        b.openElement(0, "input");
        b.addAttribute(1, "id", "submit-name");
        b.closeElement();
      },
      () => {
        submitted++;
      },
    );
    const form = container.querySelector("form")!;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle(renderer);
    expect(submitted).toBe(0);

    // Fix the whole model: validate() reads it on the next submit.
    model.name = "Holger";
    model.age = 42;
    model.agree = true;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await settle(renderer);
    expect(submitted).toBe(1);
  });
});