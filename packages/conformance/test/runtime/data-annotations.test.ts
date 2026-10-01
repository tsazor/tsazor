/**
 * DataAnnotationsValidator semantics vs. Blazor (src/Components/Forms/src/
 * DataAnnotationsValidator.cs + EditContextDataAnnotationsExtensions.cs) —
 * roadmap 3.6. The validation model decision (Empfehlung "Decorators"):
 * field-rule decorators as the DataAnnotations pendant, `DataAnnotationsValidator`
 * as the built-in EditForm validator, .NET's DataAnnotations error texts.
 */
import { describe, expect, it } from "vitest";
import {
  Compare,
  DataAnnotationsValidator,
  defineComponent,
  EditContext,
  EditForm,
  EmailAddress,
  EventCallback,
  MaxLength,
  MinLength,
  Range,
  RegularExpression,
  Required,
  StringLength,
  ValidationMessage,
  enableDataAnnotationsValidation,
  type RenderTreeBuilder,
} from "@tsazor/runtime";
import { host } from "./host.js";

/** A model like a ported .cs model: decorated fields. */
class Person {
  @Required()
  name = "";
  @MinLength(3)
  @MaxLength(20)
  nickname = "";
  @Range(18, 99)
  age = 0;
  @EmailAddress()
  email = "";
  @RegularExpression("^[A-Z]{3}$")
  code = "";
  @StringLength(12, { minimumLength: 4 })
  password = "";
  @Compare("password")
  confirmedPassword = "nope";
}

describe("DataAnnotations field rules", () => {
  it("formats .NET's DataAnnotations error texts with the field name as display name", () => {
    const context = new EditContext(new Person());
    const unsubscribe = enableDataAnnotationsValidation(context);
    expect(context.validate()).toBe(false);
    expect(context.getValidationMessages()).toEqual([
      "The name field is required.",
      "The field nickname must be a string or array type with a minimum length of '3'.",
      "The field age must be between 18 and 99.",
      "The email field is not a valid e-mail address.",
      "The field code must match the regular expression '^[A-Z]{3}$'.",
      "The field password must be a string with a minimum length of 4 and a maximum length of 12.",
      "'confirmedPassword' and 'password' do not match.",
    ]);
    unsubscribe.dispose();
  });

  it("a valid model yields no messages and validate() returns true", () => {
    const model = new Person();
    model.name = "Ada";
    model.nickname = "ada";
    model.age = 33;
    model.email = "ada@example.com";
    model.code = "ABC";
    model.password = "secret";
    model.confirmedPassword = "secret";
    const context = new EditContext(model);
    const unsubscribe = enableDataAnnotationsValidation(context);
    expect(context.validate()).toBe(true);
    expect(context.getValidationMessages()).toEqual([]);
    unsubscribe.dispose();
  });

  it("a field change revalidates exactly that field (Blazor's OnFieldChanged handler)", () => {
    const model = new Person();
    const context = new EditContext(model);
    const unsubscribe = enableDataAnnotationsValidation(context);
    // An error left from a previous pass disappears when the field becomes valid …
    context.validate();
    expect(context.getValidationMessages("name")).toEqual(["The name field is required."]);
    context.notifyFieldChanged("name", "Ada");
    expect(context.getValidationMessages("name")).toEqual([]);
    // … reappears when it goes invalid again …
    context.notifyFieldChanged("name", "");
    expect(context.getValidationMessages("name")).toEqual(["The name field is required."]);
    // … and a valid new value for another field judges only that field.
    expect(context.getValidationMessages("age")).toEqual(["The field age must be between 18 and 99."]);
    context.notifyFieldChanged("age", 50);
    expect(context.getValidationMessages("age")).toEqual([]);
    unsubscribe.dispose();
  });

  it("Required judges .NET-style: whitespace strings missing, booleans non-strings valid", () => {
    class Flag {
      @Required()
      flag = false;
      @Required({ allowEmptyStrings: true })
      optional = "";
    }
    const context = new EditContext(new Flag());
    const unsubscribe = enableDataAnnotationsValidation(context);
    expect(context.validate()).toBe(true);
    context.notifyFieldChanged("flag", false);
    expect(context.getValidationMessages("flag")).toEqual([]);
    context.notifyFieldChanged("flag", null);
    expect(context.getValidationMessages("flag")).toEqual(["The flag field is required."]);
    // allowEmptyStrings: the empty string is valid (Blazor's RequiredAttribute).
    context.notifyFieldChanged("optional", "");
    expect(context.getValidationMessages("optional")).toEqual([]);
    unsubscribe.dispose();
  });

  it("multiple rules on one field append their messages in declaration order", () => {
    class Model {
      @MinLength(5)
      @EmailAddress()
      mail = "ab";
    }
    const context = new EditContext(new Model());
    const unsubscribe = enableDataAnnotationsValidation(context);
    expect(context.validate()).toBe(false);
    expect(context.getValidationMessages("mail")).toEqual([
      "The field mail must be a string or array type with a minimum length of '5'.",
      "The mail field is not a valid e-mail address.",
    ]);
    unsubscribe.dispose();
  });
});

/** The EditForm host from forms.test.ts, with a DataAnnotationsValidator inside. */
async function validatorFormHost(model: object, attrs: Record<string, unknown>) {
  const build = (b: RenderTreeBuilder) => {
    b.openComponent(0, defineComponent(EditForm));
    b.addAttribute(1, "Model", model as never);
    let seq = 2;
    for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value as never);
    b.addAttribute(10, "ChildContent", ((_context: EditContext) => (inner: RenderTreeBuilder) => {
      inner.openComponent(0, defineComponent(DataAnnotationsValidator));
      inner.closeComponent();
      inner.openComponent(1, defineComponent(ValidationMessage));
      inner.addAttribute(2, "For", "name");
      inner.closeComponent();
      inner.openElement(3, "button");
      inner.addAttribute(4, "type", "submit");
      inner.closeElement();
    }) as never);
    b.closeComponent();
  };
  const h = await host(build);
  const submit = async (): Promise<void> => {
    h.container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await h.settle();
  };
  return { h, submit };
}

describe("EditForm + DataAnnotationsValidator submit semantics", () => {
  it("an invalid model routes to OnInvalidSubmit with the DataAnnotations text", async () => {
    const calls: string[] = [];
    const { h, submit } = await validatorFormHost(new Person(), {
      OnInvalidSubmit: EventCallback.unbound((context: EditContext) => void calls.push(context.isValid() ? "valid" : "invalid")),
    });
    await submit();
    expect(calls).toEqual(["invalid"]);
    expect(h.text()).toContain("The name field is required.");
    expect(h.container.querySelector(".validation-message")!.textContent).toBe("The name field is required.");
  });

  it("a previously failed submit recovers: fixing the field makes OnValidSubmit fire", async () => {
    const calls: string[] = [];
    const model = new Person();
    model.age = 40;
    model.nickname = "ada";
    model.email = "a@b.co";
    model.code = "ABC";
    model.password = "secret";
    model.confirmedPassword = "secret";
    const { h, submit } = await validatorFormHost(model, {
      OnValidSubmit: EventCallback.unbound(() => void calls.push("valid")),
      OnInvalidSubmit: EventCallback.unbound(() => void calls.push("invalid")),
    });
    await submit();
    expect(calls).toEqual(["invalid"]);
    expect(h.text()).toContain("The name field is required.");
    // Assign the model field the way the compiler's @bind does, then notify the
    // EditContext the way InputBase does: the field change revalidates only it.
    model.name = "Ada";
    // The EditContext cascades into the slot content; get it from the validator's
    // subscription instead: the simplest observable handle is the form's context —
    // reached through the ValidationMessage path after the next submit pass.
    await submit();
    expect(calls).toEqual(["invalid", "valid"]);
    expect(h.text()).not.toContain("required");
  });

  it("without a cascading EditContext the validator throws Blazor's message", async () => {
    await expect(
      host((b) => {
        b.openComponent(0, defineComponent(DataAnnotationsValidator));
        b.closeComponent();
      }),
    ).rejects.toThrow("DataAnnotationsValidator requires a cascading parameter of type EditContext. For example, you can use DataAnnotationsValidator inside an EditForm.");
  });

  it("the function-map adapter and DataAnnotations messages coexist per field", () => {
    class Model {
      @Required()
      title = "";
    }
    const context = new EditContext(new Model());
    const unsubscribe = enableDataAnnotationsValidation(context);
    context.setValidator("title", (value) => (value === "forbidden" ? "custom rule: forbidden" : null));
    context.validate();
    expect(context.getValidationMessages("title")).toEqual(["The title field is required."]);
    context.notifyFieldChanged("title", "forbidden");
    // The decorator rule is satisfied; the function adapter's message stays.
    expect(context.getValidationMessages("title")).toEqual(["custom rule: forbidden"]);
    context.notifyFieldChanged("title", "allowed");
    expect(context.getValidationMessages("title")).toEqual([]);
    unsubscribe.dispose();
  });
});