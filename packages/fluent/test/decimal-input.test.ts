/**
 * DecimalInput (Blazor's InputNumber<decimal>, MudNumericField<decimal>; the BlazorHero port's B42): an exact
 * `Decimal` in the locale's separators, null when empty, and text that is no number kept in the field with the
 * field's parsing message — the form doesn't submit (Blazor's ParsingErrorMessage).
 */
import { describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { Decimal } from "@tsazor/primitives";
import { EditForm, EventCallback, type EditContext, type RenderTreeBuilder } from "@tsazor/runtime";
import { DecimalInput } from "../dist/index.js";

interface Order {
  price: Decimal | null;
}

/** One DecimalInput bound to `order.price` inside an EditForm; the form's EditContext comes back. */
async function renderBound(order: Order, parameters: Record<string, unknown> = {}) {
  let context: EditContext | undefined;
  const changes: (Decimal | null)[] = [];
  const result = await renderTree((b) => {
    b.openComponent(0, EditForm);
    b.addAttribute(1, "model", order);
    b.addAttribute(2, "childContent", ((editContext: EditContext) => (inner: RenderTreeBuilder) => {
      context = editContext;
      inner.openComponent(0, DecimalInput);
      inner.addAttribute(1, "label", "Price");
      inner.addAttribute(2, "value", order.price);
      inner.addAttribute(3, "valueChanged", EventCallback.unbound((value: Decimal | null) => {
        order.price = value;
        changes.push(value);
      }));
      inner.addAttribute(4, "valueExpression", "price");
      let sequence = 5;
      for (const [name, value] of Object.entries(parameters)) inner.addAttribute(sequence++, name, value);
      inner.closeComponent();
    }) as never);
    b.closeComponent();
  });
  const input = result.container.querySelector("input") as HTMLInputElement;
  const type = async (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await result.settle();
  };
  return { ...result, input, type, changes, context: () => context! };
}

describe("DecimalInput", () => {
  it("shows the exact value in the locale's separators, the scale kept, in a decimal text field", async () => {
    const { input } = await renderBound({ price: Decimal.from("1234.50") }, { locale: "de-DE" });
    expect([input.type, input.inputMode, input.value]).toEqual(["text", "decimal", "1234,50"]);
  });

  it("writes the value by a .NET format ('N2' groups it)", async () => {
    const { input } = await renderBound({ price: Decimal.from("1234.5") }, { locale: "de-DE", format: "N2" });
    expect(input.value).toBe("1.234,50");
  });

  it("parses the locale's text, with or without groups, exactly; empty is null", async () => {
    const order: Order = { price: null };
    const { type, changes } = await renderBound(order, { locale: "de-DE" });
    await type("1.234,5");
    await type("0,10");
    await type("");
    expect(changes.map((value) => value?.toString() ?? null)).toEqual(["1234.5", "0.10", null]);
    expect(order.price).toBeNull();
  });

  it("keeps the value on text that is no number, with the parsing message on the field: the form doesn't submit", async () => {
    const order: Order = { price: Decimal.from("19.90") };
    const { input, type, changes, context } = await renderBound(order, { locale: "en-US" });
    await type("19,90 EUR");
    expect(changes).toEqual([]);
    expect(order.price!.toString()).toBe("19.90");
    expect(input.value).toBe("19,90 EUR");
    expect(context().getValidationMessages("price")).toEqual(["The Price field must be a number."]);
    expect(context().validate()).toBe(false);

    await type("19.95");
    expect(order.price!.toString()).toBe("19.95");
    expect(context().getValidationMessages("price")).toEqual([]);
    expect(context().validate()).toBe(true);
  });

  it("takes its own parsing message ({0} is the label)", async () => {
    const { type, context } = await renderBound({ price: null }, { locale: "en-US", parsingErrorMessage: "{0}: digits only" });
    await type("abc");
    expect(context().getValidationMessages("price")).toEqual(["Price: digits only"]);
  });

  it("takes its parsing message with it when it goes", async () => {
    const result = await renderBound({ price: null }, { locale: "en-US" });
    await result.type("abc");
    const context = result.context();
    result.dispose();
    expect(context.getValidationMessages("price")).toEqual([]);
  });

  it("is a spin button: ↑ and ↓ step it exactly, the scale kept, within min and max", async () => {
    const order: Order = { price: Decimal.from("19.90") };
    const { input, changes } = await renderBound(order, { locale: "de-DE", step: "0.05", min: 0, max: "20" });
    const key = async (name: string) => {
      const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      await Promise.resolve();
      return event.defaultPrevented;
    };
    expect([input.getAttribute("role"), input.getAttribute("aria-valuenow"), input.getAttribute("aria-valuetext"), input.getAttribute("aria-valuemin"), input.getAttribute("aria-valuemax")])
      .toEqual(["spinbutton", "19.90", "19,90", "0", "20"]);
    expect(await key("ArrowUp")).toBe(true);
    expect([order.price?.toString(), input.value]).toEqual(["19.95", "19,95"]);
    await key("ArrowUp");
    await key("ArrowUp");
    expect(order.price?.toString()).toBe("20");
    input.value = "0,03";
    await key("ArrowDown");
    expect([order.price?.toString(), input.value]).toEqual(["0", "0"]);
    input.value = "abc";
    expect(await key("ArrowUp")).toBe(false);
    expect(changes.at(-1)?.toString()).toBe("0");
  });

  it("steps by 1 from an empty field; read-only, it doesn't step", async () => {
    const order: Order = { price: null };
    const { input } = await renderBound(order, { locale: "en-US" });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
    expect(order.price?.toString()).toBe("-1");
    const locked: Order = { price: Decimal.from("1") };
    const second = await renderBound(locked, { readOnly: true });
    second.input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    expect(locked.price?.toString()).toBe("1");
  });

  it("is read-only with the native readonly", async () => {
    const { input } = await renderBound({ price: Decimal.from("1") }, { readOnly: true });
    expect([input.readOnly, input.disabled]).toEqual([true, false]);
  });
});
