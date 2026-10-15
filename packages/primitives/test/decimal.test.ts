import { describe, expect, it } from "vitest";
import { Decimal } from "../src/index.js";

describe("Decimal", () => {
  it("preserves the scale of a literal (trailing zeros), as .NET decimal", () => {
    expect(Decimal.from("19.99").toString()).toBe("19.99");
    expect(Decimal.from("19.90").toString()).toBe("19.90");
    expect(Decimal.from("19.9").toString()).toBe("19.9");
    expect(Decimal.from("-0.50").toString()).toBe("-0.50");
    expect(Decimal.from("0").toString()).toBe("0");
  });

  it("does exact base-10 arithmetic where number drifts", () => {
    expect(Decimal.from("0.1").add("0.2").toString()).toBe("0.3");
    expect(Decimal.from("19.99").mul(3).toString()).toBe("59.97");
    expect(Decimal.from("19.99").mul(3).mul("1.19").round(2).toString()).toBe("71.36");
    expect(Decimal.from("10").div("4", 2).toString()).toBe("2.50");
    expect(Decimal.from("1").div("3", 2).toString()).toBe("0.33");
    expect(Decimal.from("1").div("6", 2).toString()).toBe("0.17");
  });

  it("rounds with every MidpointRounding mode", () => {
    expect(Decimal.from("2.5").round(0, "toEven").toString()).toBe("2");
    expect(Decimal.from("3.5").round(0, "toEven").toString()).toBe("4");
    expect(Decimal.from("-2.5").round(0, "toEven").toString()).toBe("-2");
    expect(Decimal.from("-3.5").round(0, "toEven").toString()).toBe("-4");
    expect(Decimal.from("2.5").round(0, "awayFromZero").toString()).toBe("3");
    expect(Decimal.from("-2.5").round(0, "awayFromZero").toString()).toBe("-3");
    expect(Decimal.from("2.5").round(0, "toZero").toString()).toBe("2");
    expect(Decimal.from("2.5").round(0, "toPositive").toString()).toBe("3");
    expect(Decimal.from("-2.5").round(0, "toPositive").toString()).toBe("-2");
    expect(Decimal.from("2.5").round(0, "toNegative").toString()).toBe("2");
    expect(Decimal.from("-2.5").round(0, "toNegative").toString()).toBe("-3");
  });

  it("compares and equates by value, ignoring scale", () => {
    expect(Decimal.from("19.90").equals("19.9")).toBe(true);
    expect(Decimal.from("19.90").compare("19.9")).toBe(0);
    expect(Decimal.from("2").compare("1.99")).toBe(1);
    expect(Decimal.from("-1").compare("0")).toBe(-1);
  });

  it("parses the invariant grammar", () => {
    expect(Decimal.parse("19.99")!.toString()).toBe("19.99");
    expect(Decimal.parse("1,234.5")!.toString()).toBe("1234.5");
    expect(Decimal.parse("-0.50")!.toString()).toBe("-0.50");
    expect(Decimal.parse("5.")!.toString()).toBe("5");
    expect(Decimal.parse(".5")!.toString()).toBe("0.5");
    expect(Decimal.parse("abc")).toBeNull();
    expect(Decimal.parse("")).toBeNull();
  });

  it("parses a culture's separators", () => {
    expect(Decimal.parse("1.234,5", "de-DE")!.toString()).toBe("1234.5");
    expect(Decimal.parse("-1.234,50", "de-DE")!.toString()).toBe("-1234.50");
    // The invariant text is a parse failure in a culture whose separators differ.
    expect(Decimal.parse("1,234.5", "de-DE")).toBeNull();
  });

  it("formats through Intl and serializes as a string", () => {
    expect(Decimal.from("71.36").format("de-DE", { style: "currency", currency: "EUR" })).toContain("71,36");
    expect(Decimal.from("19.99").toNumber()).toBe(19.99);
    expect(JSON.stringify({ amount: Decimal.from("19.99") })).toBe('{"amount":"19.99"}');
  });

  it("builds from an unscaled BigInt and a scale", () => {
    expect(Decimal.from(1999n, 2).toString()).toBe("19.99");
    expect(Decimal.from(1999n).toString()).toBe("1999");
  });

  it("throws on division by zero", () => {
    expect(() => Decimal.one.div(Decimal.zero)).toThrow(/zero/);
  });
});
