/**
 * `@bind:format` — the BindConverter subset (roadmap 3.7): formatValue renders
 * a number/date through an explicit format, parseValue re-parses the change
 * value, both invariant culture (A5/B7 policy). The masks' decimal count via
 * toFixed; zero padding of the integral part is a documented deviation. The
 * compiler emits these calls for number/date binds (codegen.test.ts); here are
 * the value semantics against .NET's BindConverter behavior for the subset.
 */
import { describe, expect, it } from "vitest";
import { formatValue, parseValue } from "@tsazor/runtime";
import { mount } from "../harness.js";

describe("formatValue — numbers", () => {
  it("F<n> is fixed point (invariant, no grouping)", () => {
    expect(formatValue(3.14159, "F2")).toBe("3.14");
    expect(formatValue(3, "F2")).toBe("3.00");
    expect(formatValue(3.14159, "F")).toBe("3");
    expect(formatValue(-3.14159, "F2")).toBe("-3.14");
  });

  it("N<n> groups thousands invariant", () => {
    expect(formatValue(1234567.891, "N2")).toBe("1,234,567.89");
    expect(formatValue(42, "N")).toBe("42");
    expect(formatValue(-1234.5, "N1")).toBe("-1,234.5");
  });

  it("digit masks count their decimals, grouping when the mask holds a comma", () => {
    expect(formatValue(2.5, "0.00")).toBe("2.50");
    expect(formatValue(1234.567, "0.0")).toBe("1234.6");
    expect(formatValue(1234.567, "#,##0.0")).toBe("1,234.6");
    expect(formatValue(42, "0")).toBe("42");
  });

  it("values without a supported format render as their string (BindConverter applies formats only to values that have one)", () => {
    expect(formatValue(42, "d")).toBe("42");
    expect(formatValue("abc", "F2")).toBe("abc");
    expect(formatValue(null, "F2")).toBe("");
    expect(formatValue(undefined, "0.00")).toBe("");
  });
});

describe("formatValue — dates", () => {
  const date = new Date(2024, 0, 5, 14, 3, 9);

  it("token subset renders with padded two-digit getters", () => {
    expect(formatValue(date, "yyyy-MM-dd HH:mm:ss")).toBe("2024-01-05 14:03:09");
    expect(formatValue(date, "dd.MM.yyyy")).toBe("05.01.2024");
  });

  it("single-letter tokens render unpadded", () => {
    expect(formatValue(date, "M/d/yyyy")).toBe("1/5/2024");
    expect(formatValue(date, "yy")).toBe("24");
    expect(formatValue(new Date(2024, 11, 20), "M/d/yy")).toBe("12/20/24");
  });

  it("every other character is literal text", () => {
    expect(formatValue(date, "Tag yyyy/jahr?")).toContain("Tag 2024");
  });
});

describe("parseValue", () => {
  it("parses numbers invariant, removing group separators and whitespace", () => {
    expect(parseValue("3.14", "F2")).toBe(3.14);
    expect(parseValue("1,234.56", "N2")).toBe(1234.56);
    expect(parseValue("-2.50", "0.00")).toBe(-2.5);
    expect(parseValue("abc", "0.00")).toBeNull();
    expect(parseValue("", "0.00")).toBeNull();
  });

  it("parses dates by the format's tokens and rejects overflow", () => {
    expect(parseValue("2024-01-05", "yyyy-MM-dd")).toEqual(new Date(2024, 0, 5));
    expect(parseValue("05.01.2024", "dd.MM.yyyy")).toEqual(new Date(2024, 0, 5));
    expect(parseValue("2024-01-05 14:03:09", "yyyy-MM-dd HH:mm:ss")).toEqual(new Date(2024, 0, 5, 14, 3, 9));
    // Month 13, day 32 → null (Blazor's TryParse fails → the bind keeps its value).
    expect(parseValue("2024-13-05", "yyyy-MM-dd")).toBeNull();
    expect(parseValue("2024-05-32", "yyyy-MM-dd")).toBeNull();
    expect(parseValue("garbage", "yyyy-MM-dd")).toBeNull();
  });

  it("single-letter tokens parse one or two digits", () => {
    expect(parseValue("5.1.2024", "M.d.yyyy")).toEqual(new Date(2024, 4, 1));
    expect(parseValue("12/20/24", "M/d/yy")).toEqual(new Date(2024, 11, 20));
  });

  it("round trips through formatValue", () => {
    const date = new Date(2024, 6, 19, 8, 4, 2);
    expect(parseValue(formatValue(date, "yyyy-MM-dd"), "yyyy-MM-dd")).toEqual(new Date(2024, 6, 19));
    expect(parseValue(formatValue(1234.5, "0.00"), "0.00")).toBe(1234.5);
  });
});

describe("@bind:format through the compiler (3.7, end to end)", () => {
  it("a number input renders through the format and parses the change value", async () => {
    const m = await mount(`<input type="number" @bind="amount" @bind:format="0.00" /><p>@amount</p>
@code { private amount = 2.5; }`);
    const input = m.container.querySelector("input")!;
    expect(input.value).toBe("2.50");

    input.value = "7.00";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.amount).toBe(7);
    expect(m.container.querySelector("p")!.textContent).toBe("7");
    expect(input.value).toBe("7.00");
  });

  it("a date input renders through the format and parses the change value", async () => {
    const m = await mount(`<input type="date" @bind="day" @bind:format="yyyy-MM-dd" /><p>@day</p>
@code { private day = new Date(2024, 0, 5); }`);
    const input = m.container.querySelector("input")!;
    expect(input.value).toBe("2024-01-05");

    input.value = "2024-03-10";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.day).toEqual(new Date(2024, 2, 10));
    expect(input.value).toBe("2024-03-10");
  });

  it("an unparseable change value keeps the model's previous value (Blazor's TryParse false)", async () => {
    const m = await mount(`<input type="number" @bind="amount" @bind:format="0.00" />
@code { private amount = 2.5; }`);
    const input = m.container.querySelector("input")!;
    input.value = "";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await m.settle();
    expect(m.instance.amount).toBe(2.5);
    // The diff sees the formatted value unchanged → the typed text stays, as
    // in Blazor (the displayed value follows only a real value change).
    expect(input.value).toBe("");
  });
});