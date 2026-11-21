/**
 * Source maps: every generated position maps back to its .tsazor origin, also
 * after multi-line expressions. Review §1: C10 and @code columns.
 */
import { describe, expect, it } from "vitest";
import { compile } from "@tsazor/compiler";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

/** Original (1-based line, 0-based column) of the first occurrence of `needle` in the generated code. */
function originOf(source: string, needle: string): { line: number | null; column: number | null } {
  const result = compile(source, { className: "Test", fileName: "Test.tsazor" });
  const index = result.code.indexOf(needle);
  expect(index, `generated code contains ${needle}`).toBeGreaterThanOrEqual(0);
  const before = result.code.slice(0, index);
  const line = before.split("\n").length;
  const column = index - (before.lastIndexOf("\n") + 1);
  const pos = originalPositionFor(new TraceMap(result.map!), { line, column });
  return { line: pos.line, column: pos.column };
}

describe("C10 — mappings after multi-line constructs", () => {
  it("after a multi-line attribute expression", () => {
    const source = `<p title="@(\n    first +\n    second)">x</p>\n<span>@marker</span>\n@code { private first = ""; private second = ""; private marker = 1; }`;
    expect(originOf(source, "this.marker").line).toBe(4);
  });

  it("after a multi-line @if condition", () => {
    const source = `@if (a &&\n    b) {\n    <i>@x</i>\n}\n@code { private a = true; private b = true; private x = 1; }`;
    expect(originOf(source, "this.x").line).toBe(3);
  });
});

describe("@code columns", () => {
  it("tab-indented members keep their column", () => {
    const source = `@code {\n\tprivate tabbed = 1;\n}`;
    expect(originOf(source, "private tabbed")).toEqual({ line: 2, column: 1 });
  });

  it("single-line @code maps to the member, not the block start", () => {
    const source = `@code { private y = 2; }`;
    expect(originOf(source, "private y")).toEqual({ line: 1, column: 8 });
  });
});
