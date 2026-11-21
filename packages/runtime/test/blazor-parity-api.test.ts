/**
 * Blazor APIs a component library reaches for (a port of Radzen Blazor that consumed only the packages: F4, F32):
 * EditContext.FieldCssClass with SetFieldCssClassProvider — the classes every input of a form shows — and
 * ParameterView.FromDictionary, toDictionary's counterpart for passing on a filtered view; CultureInfo.NumberFormat
 * (F30), the separators a numeric input formats and reads with.
 */
import { describe, expect, it } from "vitest";
import { CultureInfo, EditContext, FieldCssClassProvider, ParameterView } from "../src/index";

describe("EditContext.fieldCssClass (Blazor's FieldCssClass)", () => {
  it("has Blazor's four states by default", () => {
    const context = new EditContext({ name: "" });
    expect(context.fieldCssClass("name")).toBe("valid");
    const store = context.createValidationMessageStore();
    store.add("name", "Required.");
    expect(context.fieldCssClass("name")).toBe("invalid");
    context.notifyFieldChanged("name", "x");
    expect(context.fieldCssClass("name")).toBe("modified invalid");
    store.clear("name");
    expect(context.fieldCssClass("name")).toBe("modified valid");
  });

  it("takes the classes from a provider the form sets (Bootstrap's is-valid / is-invalid)", () => {
    class BootstrapClasses extends FieldCssClassProvider {
      override getFieldCssClass(editContext: EditContext, field: string): string {
        if (!editContext.isModified(field)) return "";
        return editContext.isValid(field) ? "is-valid" : "is-invalid";
      }
    }
    const context = new EditContext({ name: "" });
    context.setFieldCssClassProvider(new BootstrapClasses());
    expect(context.fieldCssClass("name")).toBe("");
    context.notifyFieldChanged("name", "x");
    expect(context.fieldCssClass("name")).toBe("is-valid");
  });
});

describe("ParameterView.fromDictionary (Blazor's FromDictionary)", () => {
  it("is toDictionary's counterpart: a view of the object's properties, to pass on without a key", () => {
    const view = ParameterView.fromDictionary({ value: 3, "aria-autocomplete": "list", ChildContent: undefined });
    expect(view.getValue("value")).toBe(3);
    expect(view.has("ChildContent")).toBe(true);
    const { ["aria-autocomplete"]: _taken, ...rest } = view.toDictionary();
    const passedOn = ParameterView.fromDictionary(rest);
    expect(passedOn.has("aria-autocomplete")).toBe(false);
    expect(passedOn.entries()).toEqual([["value", 3], ["ChildContent", undefined]]);
  });
});

describe("CultureInfo.numberFormatInfo (.NET's NumberFormatInfo)", () => {
  it("gives the culture's separators and signs, which a numeric input formats and reads with", () => {
    const german = new CultureInfo("de-DE").numberFormatInfo;
    expect([german.numberDecimalSeparator, german.numberGroupSeparator, german.percentSymbol]).toEqual([",", ".", "%"]);
    const invariant = CultureInfo.invariant.numberFormatInfo;
    expect(invariant).toMatchObject({ numberDecimalSeparator: ".", numberGroupSeparator: ",", negativeSign: "-", positiveSign: "+", nanSymbol: "NaN" });
    // Read once per culture instance, frozen.
    expect(Object.isFrozen(german)).toBe(true);
    expect(new CultureInfo("de-DE").numberFormatInfo).toEqual(german);
  });
});
