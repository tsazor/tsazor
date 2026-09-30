/**
 * TsazorGenMap tests: position round-trips over compiler mappings.
 * Conventions: genCol is the 0-based column of the statement's first content
 * character; genLine is 1-based; source lines/cols are 0-based.
 */
import { compile } from "@tsazor/compiler";
import { describe, expect, it } from "vitest";
import type { SourceMapEntry } from "@tsazor/compiler";
import { TsazorGenMap } from "../src/ts-mapping";

function compileMap(source: string) {
  const result = compile(source, { className: "Demo", fileName: "Demo.tsazor" });
  return { code: result.code, raw: result.mappings ?? [] };
}

describe("TsazorGenMap — hand-built entries", () => {
  const entries: SourceMapEntry[] = [
    { genLine: 10, genCol: 4, srcLine: 2, srcCol: 0 }, // verbatim @code line ('…' starts at gen col 4)
    { genLine: 20, genCol: 4, srcLine: 8, srcCol: 3 }, // statement start (the '@')
    { genLine: 20, genCol: 4, srcLine: 8, srcCol: 4 }, // token `Title` (same genCol, pushed after the stmt)
    { genLine: 20, genCol: 15, srcLine: 0, srcCol: 10 }, // token after a dot
  ];
  const map = new TsazorGenMap(entries);

  it("maps a generated token start back to the token position", () => {
    // Statement entry and token entry share genCol 4 — the later (token) wins.
    expect(map.genToSrc(19, 4)).toEqual({ line: 8, character: 4 });
    // Inside the first token: delta arithmetic keeps it there.
    expect(map.genToSrc(19, 6)).toEqual({ line: 8, character: 6 });
  });

  it("switches to the next token entry along the generated line", () => {
    expect(map.genToSrc(19, 14)).toEqual({ line: 8, character: 14 }); // delta arithmetic stays inside the token
    expect(map.genToSrc(19, 15)).toEqual({ line: 0, character: 10 }); // the after-dot token
  });

  it("maps verbatim @code columns exactly", () => {
    expect(map.genToSrc(9, 4)).toEqual({ line: 2, character: 0 });
    expect(map.genToSrc(9, 7)).toEqual({ line: 2, character: 3 });
  });

  it("maps a .tsazor position forward into the shadow", () => {
    expect(map.srcToGen(8, 3)).toEqual({ line: 19, column: 4 }); // statement start
    expect(map.srcToGen(8, 5)).toEqual({ line: 19, column: 5 }); // one char into the token
    expect(map.srcToGen(2, 0)).toEqual({ line: 9, column: 4 }); // verbatim line
    expect(map.srcToGen(0, 12)).toEqual({ line: 19, column: 17 }); // delta inside the last token
  });

  it("maps token spans (hover ranges)", () => {
    expect(map.genToSpan(19, 4, 7)).toEqual({ start: { line: 8, character: 4 }, end: { line: 8, character: 7 } });
  });

  it("returns null beyond mapped regions instead of mistranslating", () => {
    expect(map.genToSrc(0, 0)).toBeNull();
    expect(map.genToSrc(30, 4)).toBeNull();
    expect(map.genToSrc(19, 0)).toBeNull(); // col left of the statement entry
    expect(map.srcToGen(500, 0)).toBeNull();
  });
});

describe("TsazorGenMap — compiler-produced entries", () => {
  it("round-trips an expression: the token entry anchors at its own generated token", () => {
    const { code, raw } = compileMap("<p>@Store.count</p>\n");
    const map = new TsazorGenMap(raw);
    // Cursor at `Store` start (col 4) → the generated `Store` token — the
    // synthetic `this.` prefix carries no source position of its own.
    const fwd = map.srcToGen(0, 4);
    expect(fwd).not.toBeNull();
    const line = code.split("\n")[fwd!.line]!;
    expect(line.slice(fwd!.column, fwd!.column + 10)).toBe("Store.coun");
    // Same generated column back to source lands on the token start.
    const back = map.genToSrc(fwd!.line, fwd!.column);
    expect(back).toEqual({ line: 0, character: 4 });
  });

  it("maps inside a verbatim @code block column-exactly", () => {
    const { code, raw } = compileMap('@code {\n    priceText = "";\n}\n');
    const map = new TsazorGenMap(raw);
    const lines = code.split("\n");
    const genLine = lines.findIndex((l) => l.includes("priceText"));
    const genCol = lines[genLine]!.indexOf("priceText");
    expect(map.genToSrc(genLine, genCol)).toEqual({ line: 1, character: 4 });
    // Cursor mid-token in source (offset 6 into `priceText`) → the same
    // offset into the verbatim generated token: columns stay exact.
    const fwd = map.srcToGen(1, 10);
    expect(fwd).not.toBeNull();
    const genStart = lines[fwd!.line]!.indexOf("priceText");
    expect(fwd!.column).toBe(genStart + 6);
    // And the mapped position round-trips back onto the same source column.
    expect(map.genToSrc(fwd!.line, fwd!.column)).toEqual({ line: 1, character: 10 });
  });

  it("degrades to null for synthetic regions instead of mistranslating", () => {
    const map = new TsazorGenMap(compileMap("@code {\n  x = 1;\n}\n").raw);
    expect(map.genToSrc(0, 0)).toBeNull(); // import header — no mappings
    expect(map.srcToGen(500, 0)).toBeNull(); // far beyond the file
  });
});