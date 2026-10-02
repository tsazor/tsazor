/**
 * `@Bindable()` (Tsazor extension) in the editor: the TZS030 quick fix
 * "insert accessor", the refactor "convert Value/ValueChanged pair to
 * @Bindable" and the hover that shows the desugared pair.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyTextEdits } from "@tsazor/compiler";
import { analyzeSource, bindableHoverAt, bindableRefactorsAt, quickFixesAt, type LspRange } from "../src/analysis";

let root = "";

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-lsp-bindable-"));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const at = (line: number, character: number): LspRange => ({ start: { line, character }, end: { line, character } });

/** LSP edits (0-based lines) applied to the source. */
function apply(source: string, edits: Array<{ range: LspRange; newText: string }>): string {
  return applyTextEdits(
    source,
    edits.map((edit) => ({
      pos: { line: edit.range.start.line + 1, column: edit.range.start.character },
      endPos: { line: edit.range.end.line + 1, column: edit.range.end.character },
      text: edit.newText,
    })),
  );
}

describe("TZS030 quick fix", () => {
  it("inserts 'accessor' before the member name; the result compiles clean", async () => {
    const source = "<p>@Value</p>\n@code {\n    @Bindable() Value = 0;\n}\n";
    const file = path.join(root, "Field.tsazor");
    const analyzed = await analyzeSource(file, source, root);
    const fixes = quickFixesAt(analyzed, at(2, 18));
    expect(fixes.map((fix) => fix.title)).toEqual(["Insert 'accessor'"]);
    const fixed = apply(source, fixes[0]!.edits);
    expect(fixed).toContain("@Bindable() accessor Value = 0;");
    const again = await analyzeSource(file, fixed, root);
    expect(again.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("refactor: convert pair to @Bindable", () => {
  const source = [
    '<button @onclick="inc">@Value</button>',
    "",
    "@code {",
    "    @Parameter() Value = 0;",
    "    @Parameter() ValueChanged?: EventCallback<number>;",
    "    @Parameter() Label?: string;",
    "",
    "    async inc() {",
    "        await this.ValueChanged?.invokeAsync(this.Value + 1);",
    "    }",
    "}",
    "",
  ].join("\n");

  it("is offered on either member of the pair and rewrites it", async () => {
    const analyzed = await analyzeSource(path.join(root, "Stepper.tsazor"), source, root);
    const onValue = bindableRefactorsAt(analyzed, at(3, 20));
    const onChanged = bindableRefactorsAt(analyzed, at(4, 20));
    expect(onValue.map((r) => r.title)).toEqual(["Convert 'Value'/'ValueChanged' to @Bindable()"]);
    expect(onChanged).toEqual(onValue);
    const converted = apply(source, onValue[0]!.edits);
    expect(converted).toBe(
      source.replace("    @Parameter() Value = 0;\n    @Parameter() ValueChanged?: EventCallback<number>;\n", "    @Bindable() accessor Value = 0;\n"),
    );
    // The explicit invocation keeps working: the synthesized member is declared.
    const again = await analyzeSource(path.join(root, "Stepper.tsazor"), converted, root);
    expect(again.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("is not offered elsewhere, nor for a lone parameter", async () => {
    const analyzed = await analyzeSource(path.join(root, "Stepper.tsazor"), source, root);
    expect(bindableRefactorsAt(analyzed, at(5, 20))).toEqual([]);
    expect(bindableRefactorsAt(analyzed, at(0, 3))).toEqual([]);
    const lone = await analyzeSource(path.join(root, "Lone.tsazor"), "@code {\n    @Parameter() Value = 0;\n}\n", root);
    expect(bindableRefactorsAt(lone, at(1, 20))).toEqual([]);
  });

  it("keeps modifiers and turns an optional value into `T | undefined`", async () => {
    const pairSource = "@code {\n    @Parameter() public Value?: string;\n    @Parameter() ValueChanged?: EventCallback<string>;\n}\n";
    const analyzed = await analyzeSource(path.join(root, "Opt.tsazor"), pairSource, root);
    const [refactor] = bindableRefactorsAt(analyzed, at(1, 25));
    expect(apply(pairSource, refactor!.edits)).toBe("@code {\n    @Bindable() public accessor Value: string | undefined;\n}\n");
  });
});

describe("hover on a @Bindable() member", () => {
  it("shows the desugared pair", async () => {
    const source = '@code {\n    @Bindable({ changed: "OnPick" }) accessor Value: string = "";\n}\n';
    const analyzed = await analyzeSource(path.join(root, "Picker.tsazor"), source, root);
    const hover = bindableHoverAt(analyzed, 1, 47);
    expect(hover?.markdown).toContain("@Parameter() Value: string;");
    expect(hover?.markdown).toContain("@Parameter() OnPick?: EventCallback<string>;");
    expect(bindableHoverAt(analyzed, 1, 6)).toBeNull();
  });
});
