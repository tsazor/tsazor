/**
 * LSP core tests: analysis without VS Code — diagnostics mapping, hover and
 * go-to-definition over a temp workspace (mirrors the vite-plugin tests).
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeSource, definitionAt, hoverAt } from "../src/analysis";

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

  it("returns null inside plain text", async () => {
    const filePath = path.join(root, "Pages", "Plain.tsazor");
    const analyzed = await analyzeSource(filePath, "<p>hello</p>\n", root);
    expect(hoverAt(analyzed, 0, 10)).toBeNull();
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