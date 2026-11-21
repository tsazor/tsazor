/**
 * LSP core tests: analysis without VS Code — diagnostics mapping, hover and
 * go-to-definition over a temp workspace (mirrors the vite-plugin tests).
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeSource, definitionAt, hoverAt, lspRange, quickFixesAt } from "../src/analysis";

let root = "";
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsazor-lsp-"));
  root = dir;
  await mkdir(path.join(dir, "Pages"), { recursive: true });
  await mkdir(path.join(dir, "services"), { recursive: true });
  await writeFile(
    path.join(dir, "Greeter.tsazor"),
    '<h1>@Name</h1>\n@code { private Name: string = ""; }\n',
  );
  // Templated component (2.3): fragment parameters — the hover speaks of the
  // slot and its context (2.5).
  await writeFile(
    path.join(dir, "Cards.tsazor"),
    [
      "<table></table>",
      "",
      "@code {",
      "    @Parameter() Header?: RenderFragment;",
      "    @Parameter() Row?: RenderFragment<RowData>;",
      "}",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(dir, "services", "UserService.ts"), "export default class UserService {}\n");
  // _Imports makes root + services resolvable for every file below root.
  await writeFile(path.join(dir, "_Imports.tsazor"), "@using ./services\n");
  cleanup = async () => rm(dir, { recursive: true, force: true });
});

afterAll(() => cleanup());

describe("analyzeSource", () => {
  it("publishes compiler diagnostics with LSP-compatible positions", async () => {
    const filePath = path.join(root, "Broken.tsazor");
    const analyzed = await analyzeSource(filePath, "<p>@(unclosed</p>\n", root);
    // Unclosed expression/code → the parser reports a located diagnostic.
    expect(analyzed.diagnostics.some((d) => d.code === "TZS003" || d.code === "TZS004" || d.code === "TSZE000")).toBe(true);
  });

  it("warns on unresolved component tags (TZS005) like the build does", async () => {
    const filePath = path.join(root, "Unresolved.tsazor");
    const analyzed = await analyzeSource(filePath, "<NotHere />\n", root);
    const warning = analyzed.diagnostics.find((d) => d.code === "TZS005");
    expect(warning?.severity).toBe("warning");
  });

  it("publishes the range of the whole construct and its quick fix (A7)", async () => {
    const filePath = path.join(root, "Loop.tsazor");
    const analyzed = await analyzeSource(filePath, "<ul>\n  @foreach (var item in items) { <li>@item</li> }\n</ul>\n", root);
    const diagnostic = analyzed.diagnostics.find((d) => d.code === "TZS021")!;
    // `@foreach (var item in items)` on line 1 (0-based), columns 2…30.
    expect(lspRange(diagnostic)).toEqual({ start: { line: 1, character: 2 }, end: { line: 1, character: 30 } });
    const fixes = quickFixesAt(analyzed, { start: { line: 1, character: 5 }, end: { line: 1, character: 5 } });
    expect(fixes.map((fix) => [fix.title, fix.edits])).toEqual([[
      "Use '@foreach (const item of items)'",
      [{ range: { start: { line: 1, character: 12 }, end: { line: 1, character: 29 } }, newText: "const item of items" }],
    ]]);
    // Outside the diagnostic: no fix; an empty compiler range still underlines one character.
    expect(quickFixesAt(analyzed, { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } })).toEqual([]);
    expect(lspRange({ pos: { line: 1, column: 0 }, endPos: { line: 1, column: 0 } })).toEqual({ start: { line: 0, character: 0 }, end: { line: 0, character: 1 } });
  });
});

describe("hoverAt", () => {
  it("describes a resolvable component tag", async () => {
    const filePath = path.join(root, "Pages", "UsesGreeter.tsazor");
    const analyzed = await analyzeSource(filePath, "<Greeter />\n", root);
    // <Greeter /> on line 1: any character inside the tag span.
    const info = hoverAt(analyzed, 0, 5);
    expect(info?.markdown).toContain("<Greeter>");
    expect(info?.markdown).toContain("Greeter.tsazor");
  });

  it("describes directives and @inject types", async () => {
    const filePath = path.join(root, "Pages", "WithInject.tsazor");
    const analyzed = await analyzeSource(
      filePath,
      '@page "/admin"\n@inject UserService Users\n',
      root,
    );
    // The @page directive is on line 1 (LSP line 0).
    const page = hoverAt(analyzed, 0, 3);
    expect(page?.markdown).toContain("@page");
    // The @inject directive is on line 2 (LSP line 1).
    const inject = hoverAt(analyzed, 1, 3);
    expect(inject?.markdown).toContain("@inject");
    expect(inject?.markdown).toContain("UserService");
  });

  it("describes @attach and @attach:name on the attribute name (F2)", async () => {
    const filePath = path.join(root, "Pages", "Attach.tsazor");
    const analyzed = await analyzeSource(filePath, '<input @attach="focus" @attach:tip="tip" />\n@code { focus = () => {}; tip = () => {}; }\n', root);
    expect(hoverAt(analyzed, 0, 9)?.markdown).toContain("`@attach` — runs a function");
    const named = hoverAt(analyzed, 0, 27)?.markdown;
    expect(named).toContain("`@attach:tip` is one of several attachments");
  });

  it("returns null inside plain text", async () => {
    const filePath = path.join(root, "Pages", "Plain.tsazor");
    const analyzed = await analyzeSource(filePath, "<p>hello</p>\n", root);
    expect(hoverAt(analyzed, 0, 10)).toBeNull();
  });

  it("describes a named slot with its parent, category and context (2.5)", async () => {
    const filePath = path.join(root, "Pages", "UsesCards.tsazor");
    const analyzed = await analyzeSource(filePath, "<Cards>\n    <Row Context=\"routeData\">\n        <p>x</p>\n    </Row>\n</Cards>\n", root);
    // Hover anywhere inside "<Row": the slot classification goes through the
    // direct parent (<Cards>), the context naming through the attribute.
    const info = hoverAt(analyzed, 1, 6);
    expect(info?.markdown).toContain("named slot of `<Cards>`");
    expect(info?.markdown).toContain("RenderFragment<T>");
    expect(info?.markdown).toContain("Context: `routeData` · RowData");
  });

  it("a plain fragment slot hovers without a context line", async () => {
    const filePath = path.join(root, "Pages", "UsesCardsHeader.tsazor");
    const analyzed = await analyzeSource(filePath, "<Cards>\n    <Header />\n</Cards>\n", root);
    const info = hoverAt(analyzed, 1, 7);
    expect(info?.markdown).toContain("named slot of `<Cards>`");
    expect(info?.markdown).toContain("`Header` · RenderFragment");
    expect(info?.markdown).not.toContain("Context:");
  });

  it("a nested component that is no slot keeps the component hover", async () => {
    const filePath = path.join(root, "Pages", "Nested.tsazor");
    const analyzed = await analyzeSource(filePath, "<Cards>\n    <Greeter />\n</Cards>\n", root);
    // <Greeter> has a real component behind it — even as the direct child of a
    // templated component, hover stays the component's.
    expect(hoverAt(analyzed, 1, 5)?.markdown).toContain("Tsazor component");
  });
});

describe("definitionAt", () => {
  it("jumps to the component file", async () => {
    const filePath = path.join(root, "Pages", "UsesGreeter.tsazor");
    const analyzed = await analyzeSource(filePath, "<Greeter />\n", root);
    const target = definitionAt(analyzed, 0, 5);
    expect(target?.file.toLowerCase()).toBe(path.join(root, "Greeter.tsazor").toLowerCase());
  });

  it("jumps to the @inject service file", async () => {
    const filePath = path.join(root, "Pages", "WithInject.tsazor");
    const analyzed = await analyzeSource(filePath, "@inject UserService Users\n", root);
    const target = definitionAt(analyzed, 0, 3);
    expect(target?.file.toLowerCase()).toBe(path.join(root, "services", "UserService.ts").toLowerCase());
  });

  it("gives no definition for runtime built-ins", async () => {
    const filePath = path.join(root, "Pages", "UsesBuiltIn.tsazor");
    const analyzed = await analyzeSource(filePath, "<NavLink Href='/' />\n", root);
    expect(definitionAt(analyzed, 0, 5)).toBeNull();
    // But hover still explains it.
    expect(hoverAt(analyzed, 0, 5)?.markdown).toContain("@tsazor/runtime");
  });
});