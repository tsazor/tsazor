/**
 * Select with typed options (Fluent UI Blazor's FluentSelect<TOption>, MudSelect<T>; Bootstrap; the BlazorHero port's B43):
 * `items` and `optionText`, the choice the option itself — an enum member, an object — with nothing parsed.
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EditForm, EventCallback, type EditContext, type RenderTreeBuilder } from "@tsazor/runtime";
import { Select } from "../dist/index.js";

enum Kind {
  Decimal = 0,
  Text = 1,
  Json = 3,
}

interface Brand {
  id: number;
  name: string;
}

/** One Select over `items` inside an EditForm, bound to `model.choice`; what it reported and the form come back. */
async function renderSelect<T>(model: { choice: T | null }, items: T[], parameters: Record<string, unknown> = {}) {
  let context: EditContext | undefined;
  const changes: (T | null)[] = [];
  const result = await renderTree((b) => {
    b.openComponent(0, EditForm);
    b.addAttribute(1, "model", model);
    b.addAttribute(2, "childContent", ((editContext: EditContext) => (inner: RenderTreeBuilder) => {
      context = editContext;
      inner.openComponent(0, Select);
      inner.addAttribute(1, "label", "Choice");
      inner.addAttribute(2, "items", items);
      inner.addAttribute(3, "selectedOption", model.choice);
      inner.addAttribute(4, "selectedOptionChanged", EventCallback.unbound((value: T | null) => {
        model.choice = value;
        changes.push(value);
      }));
      inner.addAttribute(5, "selectedOptionExpression", "choice");
      let sequence = 6;
      for (const [name, value] of Object.entries(parameters)) inner.addAttribute(sequence++, name, value);
      inner.closeComponent();
    }) as never);
    b.closeComponent();
  });
  const select = result.container.querySelector("select") as HTMLSelectElement;
  const choose = async (value: string) => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await result.settle();
  };
  const options = () => [...select.options].map((option) => ({ value: option.value, text: option.textContent, disabled: option.disabled, hidden: option.hidden }));
  return { ...result, select, choose, changes, options, context: () => context! };
}

describe("Select with items", () => {
  it("shows the options by their text and the chosen one; a choice is the option itself (an enum member)", async () => {
    const model: { choice: Kind | null } = { choice: Kind.Text };
    const { select, choose, changes, options } = await renderSelect(model, [Kind.Decimal, Kind.Text, Kind.Json], { optionText: (kind: Kind) => Kind[kind] });
    expect(options().map((option) => option.text)).toEqual(["Decimal", "Text", "Json"]);
    expect(select.value).toBe("1");
    await choose("2");
    expect([changes, model.choice]).toEqual([[Kind.Json], Kind.Json]);
    expect(select.value).toBe("2");
  });

  it("finds an equal copy of an object option by its key, and tells the form of a choice", async () => {
    const brands: Brand[] = [{ id: 1, name: "Rye" }, { id: 2, name: "Wheat" }];
    const model: { choice: Brand | null } = { choice: { id: 2, name: "Wheat" } };
    const { select, choose, changes, context } = await renderSelect(model, brands, { optionText: (brand: Brand) => brand.name, optionKey: (brand: Brand) => brand.id });
    expect(select.value).toBe("1");
    await choose("0");
    expect(changes[0]).toBe(brands[0]);
    expect(context().isModified("choice")).toBe(true);
  });

  it("without a placeholder, an empty choice only while nothing is chosen — hidden, not to be chosen again", async () => {
    const model: { choice: Kind | null } = { choice: null };
    const { select, choose, options } = await renderSelect(model, [Kind.Decimal, Kind.Text], { optionText: (kind: Kind) => Kind[kind] });
    expect(select.value).toBe("");
    expect(options()[0]).toEqual({ value: "", text: "", disabled: true, hidden: true });
    await choose("0");
    expect(options().map((option) => option.value)).toEqual(["0", "1"]);
  });

  it("with a placeholder, the empty choice stays and chooses null", async () => {
    const model: { choice: Kind | null } = { choice: Kind.Text };
    const { choose, changes, options } = await renderSelect(model, [Kind.Decimal, Kind.Text], { optionText: (kind: Kind) => Kind[kind], placeholder: "Any kind" });
    expect(options()[0]).toEqual({ value: "", text: "Any kind", disabled: false, hidden: false });
    await choose("");
    expect([changes, model.choice]).toEqual([[null], null]);
  });

  it("disables the options optionDisabled names; read-only, a change goes back", async () => {
    const model: { choice: Kind | null } = { choice: Kind.Decimal };
    const { select, choose, changes, options } = await renderSelect(model, [Kind.Decimal, Kind.Text], {
      optionText: (kind: Kind) => Kind[kind],
      optionDisabled: (kind: Kind) => kind === Kind.Text,
      readOnly: true,
    });
    expect(options().map((option) => option.disabled)).toEqual([false, true]);
    await choose("1");
    expect([select.value, changes]).toEqual(["0", []]);
  });
});
