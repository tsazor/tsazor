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

  it("quoted text and escapes are literal; letters are specifiers, as in .NET", () => {
    expect(formatValue(date, "'Tag' yyyy/\\j\\a\\h\\r?")).toBe("Tag 2024/jahr?");
    expect(formatValue(date, '"at" h tt, g')).toBe("at 2 PM, A.D.");
    expect(formatValue(date, "%d")).toBe("5");
  });
});

describe("formatValue — .NET's whole date grammar, invariant (FluentCMS's date formats)", () => {
  // DateFieldSettings' example date, and what .NET writes for it.
  const example = new Date(2024, 5, 12, 19, 23, 40);
  const offset = -example.getTimezoneOffset();
  const zone = `${offset < 0 ? "-" : "+"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}`;

  it("writes names, 12-hour clocks, fractions and offsets", () => {
    const cases: Array<[string, string]> = [
      ["MM/dd/yyyy", "06/12/2024"],
      ["yyyy-MM-dd", "2024-06-12"],
      ["dddd, dd MMMM yyyy", "Wednesday, 12 June 2024"],
      ["MM/dd/yyyy HH:mm", "06/12/2024 19:23"],
      ["MM/dd/yyyy hh:mm tt", "06/12/2024 07:23 PM"],
      ["MMMM dd", "June 12"],
      ["yyyy'-'MM'-'dd'T'HH':'mm':'ss.fffffffK", `2024-06-12T19:23:40.0000000${zone}`],
      ["ddd, dd MMM yyy HH':'mm':'ss 'GMT'", "Wed, 12 Jun 2024 19:23:40 GMT"],
      ["yyyy'-'MM'-'dd'T'HH':'mm':'ss", "2024-06-12T19:23:40"],
      ["HH:mm", "19:23"],
      ["hh:mm tt", "07:23 PM"],
      ["H:mm", "19:23"],
      ["h:mm tt", "7:23 PM"],
      ["HH:mm:ss", "19:23:40"],
      ["yyyy MMMM", "2024 June"],
    ];
    expect(cases.map(([format]) => formatValue(example, format))).toEqual(cases.map(([, text]) => text));
  });

  it("takes the standard one-letter formats, R and u in UTC", () => {
    expect(formatValue(example, "D")).toBe("Wednesday, 12 June 2024");
    expect(formatValue(example, "g")).toBe("06/12/2024 19:23");
    expect(formatValue(example, "s")).toBe("2024-06-12T19:23:40");
    expect(formatValue(example, "Y")).toBe("2024 June");
    const instant = new Date(Date.UTC(2024, 5, 12, 17, 23, 40, 120));
    expect(formatValue(instant, "u")).toBe("2024-06-12 17:23:40Z");
    expect(formatValue(instant, "R")).toBe("Wed, 12 Jun 2024 17:23:40 GMT");
    expect(formatValue(instant, "HH:mm:ss.fff FFFFFFF")).toMatch(/:23:40\.120 12$/);
  });

  it("parses them back: names, AM/PM, offsets and instants; a date that doesn't exist is null", () => {
    expect(parseValue("Wednesday, 12 June 2024", "D")).toEqual(new Date(2024, 5, 12));
    expect(parseValue("06/12/2024 07:23 PM", "MM/dd/yyyy hh:mm tt")).toEqual(new Date(2024, 5, 12, 19, 23));
    expect(parseValue("12 jun 2024", "dd MMM yyyy")).toEqual(new Date(2024, 5, 12));
    expect((parseValue("2024-06-12T19:23:40.1230000+02:00", "o") as Date).toISOString()).toBe("2024-06-12T17:23:40.123Z");
    expect((parseValue("2024-06-12 17:23:40Z", "u") as Date).toISOString()).toBe("2024-06-12T17:23:40.000Z");
    const time = parseValue("7:05 AM", "h:mm tt") as Date;
    expect([time.getHours(), time.getMinutes(), time.getDate()]).toEqual([7, 5, new Date().getDate()]);
    expect(parseValue("February 30", "MMMM dd")).toBeNull();
    expect(parseValue("06/12/2024", "dddd")).toBeNull();
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