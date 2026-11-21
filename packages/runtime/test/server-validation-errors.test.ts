/**
 * ServerValidationErrors: a server's field errors (ValidationProblemDetails.errors) as the EditContext's messages —
 * keys resolved against the model (ASP.NET's `Steps[1].Hsn`, System.Text.Json's `$.steps[1].hsn`, dotted), the
 * unresolved ones the model's, cleared by an edit of the field and by a submit.
 */
import { describe, expect, it } from "vitest";
import { EditContext, ServerValidationErrors, resolveServerField } from "../src/index";

class Step {
  action = "move";
  hsn = "";
}

class Scenario {
  name = "";
  steps = [new Step(), new Step()];
  owner = { displayName: "" };
}

describe("resolveServerField", () => {
  const model = new Scenario();

  it("maps ASP.NET's, System.Text.Json's and dotted keys to the model's field", () => {
    expect(resolveServerField(model, "Steps[1].Hsn")).toBe("steps.1.hsn");
    expect(resolveServerField(model, "$.steps[1].hsn")).toBe("steps.1.hsn");
    expect(resolveServerField(model, "steps.1.hsn")).toBe("steps.1.hsn");
    expect(resolveServerField(model, "Owner.DisplayName")).toBe("owner.displayName");
    expect(resolveServerField(model, "Name")).toBe("name");
  });

  it("is the model's for an empty key, an unknown property or an index past the end", () => {
    expect(resolveServerField(model, "")).toBe("");
    expect(resolveServerField(model, "$")).toBe("");
    expect(resolveServerField(model, "Budget")).toBe("");
    expect(resolveServerField(model, "Steps[5].Hsn")).toBe("");
  });
});

describe("ServerValidationErrors", () => {
  const setup = (options?: ConstructorParameters<typeof ServerValidationErrors>[1]) => {
    const context = new EditContext(new Scenario());
    return { context, errors: new ServerValidationErrors(context, options) };
  };

  it("shows each message at its field, and the unmatched at the model", () => {
    const { context, errors } = setup();
    errors.apply({ "Steps[1].Hsn": ["Unknown HSN."], Name: ["Taken."], "": ["Try again later."], Budget: ["Too high."] });
    expect(context.getValidationMessages("steps.1.hsn")).toEqual(["Unknown HSN."]);
    expect(context.getValidationMessages("name")).toEqual(["Taken."]);
    expect(context.getValidationMessages("")).toEqual(["Try again later.", "Too high."]);
    expect(context.isValid()).toBe(false);
  });

  it("apply replaces the previous messages; null clears them", () => {
    const { context, errors } = setup();
    errors.apply({ Name: ["Taken."] });
    errors.apply({ "Steps[0].Hsn": ["Missing."] });
    expect(context.getValidationMessages()).toEqual(["Missing."]);
    errors.apply(null);
    expect(context.getValidationMessages()).toEqual([]);
  });

  it("an edit drops the field's messages and its children's; a submit drops them all", () => {
    const { context, errors } = setup();
    errors.apply({ "Steps[0].Hsn": ["A."], "Steps[1].Hsn": ["B."], Name: ["Taken."], "": ["Model."] });
    context.notifyFieldChanged("steps.0.hsn");
    expect(context.getValidationMessages().sort()).toEqual(["B.", "Model.", "Taken."]);
    context.notifyFieldChanged("steps");
    expect(context.getValidationMessages().sort()).toEqual(["Model.", "Taken."]);
    context.validate();
    expect(context.getValidationMessages()).toEqual([]);
  });

  it("keeps them on edits and submits when told to; map overrides a key's field; dispose detaches", () => {
    const { context, errors } = setup({ clearOnFieldChange: false, clearOnSubmit: false, map: (key) => (key === "Title" ? "name" : undefined) });
    errors.apply({ Title: ["Taken."] });
    context.notifyFieldChanged("name");
    context.validate();
    expect(context.getValidationMessages("name")).toEqual(["Taken."]);
    errors.dispose();
    expect(context.getValidationMessages()).toEqual([]);
  });
});
