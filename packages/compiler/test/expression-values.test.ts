/**
 * explainExpressionValue: the note on unknown-name diagnostics inside a
 * plain-text value that a non-string parameter reads as an expression.
 */
import { describe, expect, it } from "vitest";
import { explainExpressionValue, type ExpressionValue } from "../src/index";

const value: ExpressionValue = { start: { line: 3, column: 16 }, end: { line: 3, column: 21 }, parameter: "answer", tag: "Nested", type: "number" };
const NOTE = " Note: 'answer' on <Nested> is a 'number' parameter, so its value is read as a TypeScript expression, not as text.";

describe("explainExpressionValue", () => {
  it("appends the note to unknown-name errors inside the value (start inclusive, end exclusive)", () => {
    for (const code of [2304, 2339, 2551, 2552]) {
      expect(explainExpressionValue(code, "Cannot find name 'hello'.", { line: 3, column: 16 }, [value])).toBe(`Cannot find name 'hello'.${NOTE}`);
    }
    expect(explainExpressionValue(2339, "m", { line: 3, column: 20 }, [value])).toBe(`m${NOTE}`);
    expect(explainExpressionValue(2339, "m", { line: 3, column: 21 }, [value])).toBe("m");
    expect(explainExpressionValue(2339, "m", { line: 3, column: 15 }, [value])).toBe("m");
    expect(explainExpressionValue(2339, "m", { line: 4, column: 16 }, [value])).toBe("m");
  });

  it("leaves other diagnostics and files without values alone", () => {
    expect(explainExpressionValue(1360, "m", { line: 3, column: 16 }, [value])).toBe("m");
    expect(explainExpressionValue(2339, "m", { line: 3, column: 16 }, undefined)).toBe("m");
  });

  it("without a known type it says 'not a string parameter'", () => {
    const { type: _type, ...untyped } = value;
    expect(explainExpressionValue(2304, "m", { line: 3, column: 16 }, [untyped])).toBe(
      "m Note: 'answer' on <Nested> is not a string parameter, so its value is read as a TypeScript expression, not as text.",
    );
  });
});
