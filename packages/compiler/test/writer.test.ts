import { describe, expect, it } from "vitest";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { compile } from "../src/compile";
import { advancePos, CodeWriter } from "../src/writer";

describe("CodeWriter", () => {
  it("splits embedded newlines into lines and resolves anchors to their real line", () => {
    const w = new CodeWriter();
    w.line("header");
    w.line("a(x +\n  y);", [
      { offset: 0, srcLine: 4, srcCol: 0 },
      { offset: 2, srcLine: 4, srcCol: 2 },
      { offset: 8, srcLine: 5, srcCol: 2 }, // `y` on the continuation line
    ]);
    w.line("after", [{ offset: 0, srcLine: 6, srcCol: 0 }]);
    expect(w.toString()).toBe("header\na(x +\n  y);\nafter\n");
    expect(w.lineCount).toBe(4);
    expect(w.mappings).toEqual([
      { genLine: 2, genCol: 0, srcLine: 4, srcCol: 0 },
      { genLine: 2, genCol: 2, srcLine: 4, srcCol: 2 },
      { genLine: 3, genCol: 2, srcLine: 5, srcCol: 2 },
      { genLine: 4, genCol: 0, srcLine: 6, srcCol: 0 },
    ]);
  });

  it("anchors at a line start belong to that line, not the previous one's end", () => {
    const w = new CodeWriter();
    w.line("ab\ncd", [{ offset: 3, srcLine: 1, srcCol: 0 }]);
    expect(w.mappings).toEqual([{ genLine: 2, genCol: 0, srcLine: 1, srcCol: 0 }]);
  });

  it("drops an anchor identical to the one just recorded", () => {
    const w = new CodeWriter();
    w.line("x", [
      { offset: 0, srcLine: 0, srcCol: 3 },
      { offset: 0, srcLine: 0, srcCol: 3 },
    ]);
    expect(w.mappings).toHaveLength(1);
  });

  it("insertLines shifts only the entries at or below the insert point", () => {
    const w = new CodeWriter();
    w.line("one", [{ offset: 0, srcLine: 0, srcCol: 0 }]);
    w.line("two", [{ offset: 0, srcLine: 1, srcCol: 0 }]);
    w.insertLines(1, ["ins1\nins2", ""]);
    expect(w.toString()).toBe("one\nins1\nins2\n\ntwo\n");
    expect(w.mappings).toEqual([
      { genLine: 1, genCol: 0, srcLine: 0, srcCol: 0 },
      { genLine: 5, genCol: 0, srcLine: 1, srcCol: 0 },
    ]);
  });

  it("advancePos walks lines and columns", () => {
    expect(advancePos({ line: 3, column: 5 }, "abc")).toEqual({ line: 3, column: 8 });
    expect(advancePos({ line: 3, column: 5 }, "a\n\n  b")).toEqual({ line: 5, column: 3 });
  });
});

/** Original (1-based line, 0-based column) of the first occurrence of `needle` in the generated code. */
function originOf(source: string, needle: string): { line: number | null; column: number | null } {
  const result = compile(source, { className: "Test", fileName: "Test.tsazor" });
  const index = result.code.indexOf(needle);
  expect(index, `generated code contains ${needle}`).toBeGreaterThanOrEqual(0);
  const before = result.code.slice(0, index);
  const pos = originalPositionFor(new TraceMap(result.map!), {
    line: before.split("\n").length,
    column: index - (before.lastIndexOf("\n") + 1),
  });
  return { line: pos.line, column: pos.column };
}

describe("source maps through the writer", () => {
  it("tokens after a multi-line attribute expression keep their line", () => {
    const source = `<p title="@(\n    first +\n    second)">x</p>\n<span>@marker</span>\n@code { private first = ""; private second = ""; private marker = 1; }`;
    // `<span>@marker</span>` is source line 4; `marker` itself sits at column 7.
    expect(originOf(source, "this.marker").line).toBe(4);
    expect(originOf(source, "marker)")).toEqual({ line: 4, column: 7 });
    // Continuation-line tokens of the multi-line expression map to their own line.
    expect(originOf(source, "second)")).toEqual({ line: 3, column: 4 });
  });

  it("@code on its own line maps from the brace line, not the directive line", () => {
    const source = `@code\n{\n\tprivate a = 1;\tprivate b = 2;\n}`;
    expect(originOf(source, "private a")).toEqual({ line: 3, column: 1 });
    // Tabs are emitted verbatim (behind the 2-space class indent), so consumers
    // that continue a mapping linearly (LSP) stay exact mid-line too.
    const code = compile(source, { className: "Test" }).code;
    expect(code).toContain("\n  \tprivate a = 1;\tprivate b = 2;\n");
  });

  it("@(x) without inner whitespace maps x to its own column", () => {
    expect(originOf(`<b>@(count)</b>@code { private count = 0; }`, "count)")).toEqual({ line: 1, column: 5 });
  });

  it("baked identifiers in @{ } blocks keep exact columns after the this. prefix", () => {
    const source = `@{\n  const z = foo + 1;\n}\n@code { private foo = 1; }`;
    expect(originOf(source, "foo + 1")).toEqual({ line: 2, column: 12 });
  });

  it("an on* component value maps its baked expression, not the EventCallback wrapper", () => {
    const result = compile(`<Child OnPick="@pick" />@code { private pick = () => {}; }`, {
      className: "Test",
      resolveComponent: () => ({ specifier: "./Child" }),
    });
    const line = result.code.split("\n").findIndex((l) => l.includes("EventCallback.bind(this, this.pick)"));
    const col = result.code.split("\n")[line]!.indexOf("pick)");
    // `@pick` → `pick` sits at column 16.
    expect(result.mappings).toContainEqual({ genLine: line + 1, genCol: col, srcLine: 0, srcCol: 16 });
  });

  it("embeds the .tsazor text as sourcesContent", () => {
    const source = `<p>@x</p>\n@code { private x = 1; }`;
    const map = JSON.parse(compile(source, { className: "Test", fileName: "Test.tsazor" }).map!);
    expect(map.sourcesContent).toEqual([source]);
  });
});
