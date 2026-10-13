/**
 * StandardSchemaValidator: a Standard Schema (zod, Valibot, ArkType — here a hand-written one, as the spec allows)
 * validates an EditForm's model. A submit writes every issue, a field change that field's; paths name fields; an
 * issue without a path is the model's; an async schema's messages arrive later.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defineComponent,
  EditContext,
  EditForm,
  EventCallback,
  Renderer,
  StandardSchemaValidator,
  standardSchemaField,
  ValidationMessage,
  ValidationSummary,
  type RenderTreeBuilder,
  type StandardSchemaIssue,
  type StandardSchemaResult,
  type StandardSchemaV1,
  ComponentBase,
} from "../src/index";

type Signup = { email: string; password: string; confirm: string };

/** A schema the way zod reports: field paths, a refinement on the confirmation, a model-level rule. */
function signupSchema(options: { async?: boolean } = {}): StandardSchemaV1<Signup> {
  const check = (value: unknown): StandardSchemaResult<Signup> => {
    const model = value as Signup;
    const issues: StandardSchemaIssue[] = [];
    if (!model.email.includes("@")) issues.push({ message: "Enter a valid email.", path: ["email"] });
    if (model.password.length < 8) issues.push({ message: "At least 8 characters.", path: [{ key: "password" }] });
    if (model.password !== model.confirm) issues.push({ message: "Passwords don't match.", path: ["confirm"] });
    if (model.email === "root@root") issues.push({ message: "Reserved account." });
    return issues.length > 0 ? { issues } : { value: model };
  };
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: (value) => (options.async ? Promise.resolve(check(value)) : check(value)),
    },
  };
}

let current: { context?: EditContext; submitted: string[] } = { submitted: [] };

class SignupForm extends ComponentBase {
  model: Signup = { email: "", password: "", confirm: "" };
  schema = signupSchema();
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, defineComponent(EditForm));
    b.addAttribute(1, "Model", this.model as never);
    b.addAttribute(2, "OnValidSubmit", EventCallback.unbound(() => void current.submitted.push("valid")) as never);
    b.addAttribute(3, "OnInvalidSubmit", EventCallback.unbound(() => void current.submitted.push("invalid")) as never);
    b.addAttribute(4, "ChildContent", ((context: EditContext) => (inner: RenderTreeBuilder) => {
      current.context = context;
      inner.openComponent(0, defineComponent(StandardSchemaValidator));
      inner.addAttribute(1, "Schema", this.schema as never);
      inner.closeComponent();
      inner.openComponent(2, defineComponent(ValidationSummary));
      inner.closeComponent();
      inner.openComponent(3, defineComponent(ValidationMessage));
      inner.addAttribute(4, "For", "confirm");
      inner.closeComponent();
    }) as never);
    b.closeComponent();
  }
}

async function mount() {
  current = { submitted: [] };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  renderer.renderInContainer(SignupForm, container);
  await renderer.waitUntilIdle();
  const submit = async (): Promise<void> => {
    container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await renderer.waitUntilIdle();
  };
  return { container, renderer, submit, context: () => current.context! };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("StandardSchemaValidator", () => {
  it("names an issue's field by its path, joined with dots; no path is the model", () => {
    expect(standardSchemaField({ message: "x", path: ["email"] })).toBe("email");
    expect(standardSchemaField({ message: "x", path: ["address", { key: "city" }] })).toBe("address.city");
    expect(standardSchemaField({ message: "x", path: ["items", 2] })).toBe("items.2");
    expect(standardSchemaField({ message: "x" })).toBe("");
  });

  it("a submit writes every issue, routes to OnInvalidSubmit, and the messages render", async () => {
    const { container, submit, context } = await mount();
    await submit();
    expect(current.submitted).toEqual(["invalid"]);
    expect(context().getValidationMessages("email")).toEqual(["Enter a valid email."]);
    expect(context().getValidationMessages("password")).toEqual(["At least 8 characters."]);
    expect([...container.querySelectorAll(".validation-summary li")].map((li) => li.textContent)).toEqual([
      "Enter a valid email.",
      "At least 8 characters.",
    ]);
  });

  it("a field change updates that field's messages only; a cross-field rule speaks on its own field", async () => {
    const { container, renderer, context } = await mount();
    const model = context().model as Signup;
    model.password = "short";
    context().notifyFieldChanged("password", model.password);
    await renderer.waitUntilIdle();
    expect(context().getValidationMessages()).toEqual(["At least 8 characters."]);
    model.password = "long enough";
    context().notifyFieldChanged("password", model.password);
    await renderer.waitUntilIdle();
    // The confirmation doesn't match now, but its message waits for its own field (or a submit).
    expect(context().getValidationMessages()).toEqual([]);
    model.confirm = "other";
    context().notifyFieldChanged("confirm", model.confirm);
    await renderer.waitUntilIdle();
    expect(container.querySelector(".validation-message")!.textContent).toBe("Passwords don't match.");
  });

  it("a valid model submits; a model-level issue (no path) blocks it under the field \"\"", async () => {
    const { submit, context } = await mount();
    const model = context().model as Signup;
    Object.assign(model, { email: "root@root", password: "long enough", confirm: "long enough" });
    await submit();
    expect(current.submitted).toEqual(["invalid"]);
    expect(context().getValidationMessages("")).toEqual(["Reserved account."]);
    model.email = "ada@example.com";
    await submit();
    expect(current.submitted).toEqual(["invalid", "valid"]);
    expect(context().getValidationMessages()).toEqual([]);
  });

  it("works on a bare EditContext too, and stops with dispose", () => {
    const context = new EditContext({ email: "x", password: "", confirm: "" });
    const validator = new StandardSchemaValidator();
    validator.editContext = context;
    validator.schema = signupSchema();
    (validator as unknown as { onInitialized(): void }).onInitialized();
    expect(context.validate()).toBe(false);
    expect(context.getValidationMessages("email")).toEqual(["Enter a valid email."]);
    validator.dispose();
    expect(context.getValidationMessages()).toEqual([]);
    expect(context.validate()).toBe(true);
  });

  it("an async schema's messages arrive after the pass (a submit doesn't wait for them)", async () => {
    const context = new EditContext({ email: "x", password: "", confirm: "" });
    const validator = new StandardSchemaValidator();
    validator.editContext = context;
    validator.schema = signupSchema({ async: true });
    (validator as unknown as { onInitialized(): void }).onInitialized();
    let notified = 0;
    context.onValidationStateChanged.subscribe(() => notified++);
    expect(context.validate()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(context.getValidationMessages("email")).toEqual(["Enter a valid email."]);
    expect(notified).toBeGreaterThanOrEqual(2);
    validator.dispose();
  });
});
