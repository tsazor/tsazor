/**
 * E12: `Decimal` as a first-class bind and validation value — the `@bind`
 * format/parse branches (formatValue/parseBindValue) and the `Range`/`Precision`
 * decorators on a Decimal field. The primitive itself is tested in
 * packages/primitives; here only the runtime's integration is.
 */
import { describe, expect, it } from "vitest";
import { Decimal } from "@tsazor/primitives";
import { ComponentBase, Precision, Range, formatValue, parseBindValue } from "../src/index";
import { validationRulesOf } from "../src/internal";

describe("Decimal @bind", () => {
  it("formats invariantly through its own fixed string (scale preserved)", () => {
    expect(formatValue(Decimal.from("19.90"), undefined)).toBe("19.90");
    expect(formatValue(Decimal.from("19.99"), "N2")).toBe("19.99");
    expect(formatValue(Decimal.from("1234.5"), "N2")).toBe("1,234.50");
    expect(formatValue(Decimal.from("71.36"), "N2")).toBe("71.36");
  });

  it("formats through Intl under @bind:culture", () => {
    expect(formatValue(Decimal.from("71.36"), "N2", "de-DE")).toContain("71,36");
  });

  it("parses back to a Decimal, invariant by default", () => {
    const parsed = parseBindValue("19.99", Decimal.zero);
    expect(parsed).toBeInstanceOf(Decimal);
    expect((parsed as Decimal).equals("19.99")).toBe(true);
  });

  it("parses the culture's separators under @bind:culture", () => {
    const parsed = parseBindValue("1.234,50", Decimal.zero, undefined, "de-DE");
    expect((parsed as Decimal).equals("1234.50")).toBe(true);
  });

  it("takes the culture's text without group separators too (.NET's NumberStyles.Number), a Decimal and a number alike", () => {
    expect((parseBindValue("1234,50", Decimal.zero, undefined, "de-DE") as Decimal).equals("1234.50")).toBe(true);
    expect(parseBindValue("1234,5", 0, undefined, "de-DE")).toBe(1234.5);
    expect(parseBindValue("1.234,5", 0, undefined, "de-DE")).toBe(1234.5);
    expect(parseBindValue("1 234,5", 0, undefined, "fr-FR")).toBe(1234.5);
    expect(parseBindValue("-1,5", 0, undefined, "sv-SE")).toBe(-1.5);
    expect(parseBindValue("−1,5", 0, undefined, "sv-SE")).toBe(-1.5);
    expect(parseBindValue("12.34,5", 0, undefined, "de-DE")).toBeNull();
  });

  it("keeps the previous value on empty or unparseable text (null)", () => {
    expect(parseBindValue("", Decimal.zero)).toBeNull();
    expect(parseBindValue("garbage", Decimal.zero)).toBeNull();
  });
});

describe("Decimal validation", () => {
  class Order extends ComponentBase {
    @Range(0, 100) amount = Decimal.zero;
    @Precision(5, 2) rate = Decimal.zero;
  }

  const rules = validationRulesOf(Order);

  it("Range compares a Decimal by value (scale-aligned)", () => {
    const range = rules.get("amount")![0];
    expect(range.validate(Decimal.from("50"), {}, "Amount")).toBeNull();
    expect(range.validate(Decimal.from("19.90"), {}, "Amount")).toBeNull();
    expect(range.validate(Decimal.from("150"), {}, "Amount")).toMatch(/between 0 and 100/);
  });

  it("Precision judges digit count and decimal places, ignoring trailing zeros", () => {
    const precision = rules.get("rate")![0];
    expect(precision.validate(Decimal.from("123.45"), {}, "Rate")).toBeNull();
    expect(precision.validate(Decimal.from("1.230"), {}, "Rate")).toBeNull(); // scale 2, trailing zero ignored
    expect(precision.validate(Decimal.from("123456"), {}, "Rate")).toMatch(/5 digits/);
    expect(precision.validate(Decimal.from("1.234"), {}, "Rate")).toMatch(/2 decimal places/);
    expect(precision.validate("nope", {}, "Rate")).toBeNull(); // non-Decimal is not judged
  });
});
