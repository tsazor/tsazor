/**
 * Workspace resolution tests: _Imports chains (incl. inherited @import
 * rebasing), strict component/type resolution and export lists over a temp
 * directory tree.
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { collectImports, createFileContext, importKindOf, packageExports, rebaseSpecifier, RUNTIME_TYPES } from "../src";

let root = "";
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tsazor-ws-"));
  root = dir;
  await mkdir(path.join(dir, "Shared"), { recursive: true });
  await mkdir(path.join(dir, "Other"), { recursive: true });
  await mkdir(path.join(dir, "Pages", "Admin"), { recursive: true });
  await writeFile(
    path.join(dir, "_Imports.tsazor"),
    [
      "@using ./Shared",
      "@using @fake/ui",
      '@import { formatDate, Status as OrderStatus } from "./util"',
      '@import "./theme.css"',
      '@import { ComponentBase } from "@tsazor/runtime"',
    ].join("\n") + "\n",
  );
  await writeFile(path.join(dir, "Pages", "_Imports.tsazor"), '@import { formatDate } from "../util-pages"\n');
  await writeFile(path.join(dir, "Shared", "Card.tsazor"), "<div class='card'>@Child</div>\n");
  await writeFile(path.join(dir, "Other", "Card.tsazor"), "<div class='other-card'></div>\n");
  await writeFile(path.join(dir, "Other", "Panel.tsazor"), "<div class='panel'></div>\n");
  await writeFile(path.join(dir, "UserService.ts"), "export default class UserService {}\n");
  await writeFile(path.join(dir, "CounterService.ts"), "export class CounterService {}\n");
  await writeFile(path.join(dir, "Both.ts"), "export class Both {}\nexport default Both;\n");
  // Barrel-like module in an _Imports layer dir: several exported names.
  await writeFile(
    path.join(dir, "models.ts"),
    "export interface Address { city: string; }\nexport interface Pizza { name: string; }\n",
  );
  // Bare package with a real export list (entry re-exports components).
  const pkg = path.join(dir, "node_modules", "@fake", "ui");
  await mkdir(path.join(pkg, "dist"), { recursive: true });
  await writeFile(
    path.join(pkg, "package.json"),
    JSON.stringify({ name: "@fake/ui", version: "1.0.0", exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js" } } }),
  );
  await writeFile(
    path.join(pkg, "dist", "index.js"),
    'export { default as Button } from "./Button.js";\nexport { default as Card } from "./Card.js";\nexport * from "./extra.js";\n',
  );
  await writeFile(path.join(pkg, "dist", "extra.js"), "export const Tooltip = {};\nexport class Theme {}\n");
  cleanup = async () => rm(dir, { recursive: true, force: true });
});

afterAll(() => cleanup());

const contextFor = async (relative: string) => {
  const file = path.join(root, relative);
  return createFileContext(file, await collectImports(path.dirname(file), root));
};

describe("collectImports", () => {
  it("walks the _Imports chain upward with the nearest layer winning", async () => {
    const chain = await collectImports(path.join(root, "Pages"), root);
    expect(chain.usings).toContain("./Shared");
    expect(chain.layers).toHaveLength(2); // Pages/_Imports + root _Imports
    expect(chain.layers[1]!.imports.map((info) => info.specifier)).toEqual(["./util", "./theme.css", "@tsazor/runtime"]);
  });

  it("rebases relative @import specifiers to the importing file, nearest layer first", async () => {
    const context = await contextFor("Pages/Admin/Users.tsazor");
    expect(context.inheritedImports.map((info) => info.specifier)).toEqual([
      "../../util-pages",
      "../../util",
      "../../theme.css",
      "@tsazor/runtime",
    ]);
    expect(context.inheritedImports[1]!.bindings).toEqual([
      { local: "formatDate", imported: "formatDate", typeOnly: false },
      { local: "OrderStatus", imported: "Status", typeOnly: false },
    ]);
  });

  it("rebaseSpecifier keeps bare, absolute and same-directory specifiers", () => {
    expect(rebaseSpecifier("@scope/pkg", "/a", "/a/b")).toBe("@scope/pkg");
    expect(rebaseSpecifier("/src/x", "/a", "/a/b")).toBe("/src/x");
    expect(rebaseSpecifier("./x", "/a", "/a")).toBe("./x");
    expect(rebaseSpecifier("./x", "/a/b", "/a")).toBe("./b/x");
  });

  it("reports missing @using directories and packages in the _Imports file (TZS018)", async () => {
    const dir = path.join(root, "Broken");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "_Imports.tsazor"), "@using ./Nowhere\n@using @missing/pkg\n@import { from \"x\"\n");
    const chain = await collectImports(dir, dir);
    const codes = chain.layers[0]!.diagnostics.map((d) => `${d.severity}:${d.code}`);
    expect(codes).toEqual(["error:TZS016", "warning:TZS018", "warning:TZS018"]);
  });

  it("says that @authorize in an _Imports file is not inherited (TZS014)", async () => {
    const dir = path.join(root, "Guarded");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "_Imports.tsazor"), "@using ./x\n@authorize\n");
    const diagnostics = (await collectImports(dir, dir)).layers[0]!.diagnostics.filter((d) => d.code === "TZS014");
    expect(diagnostics.map((d) => [d.severity, d.pos])).toEqual([["warning", { line: 2, column: 0 }]]);
    expect(diagnostics[0]!.message).toContain("not inherited");
  });
});

describe("createFileContext", () => {
  it("resolves components through _Imports directories (siblings visible)", async () => {
    const context = await contextFor("Pages/Index.tsazor");
    expect(context.resolveComponent("Card", [])?.specifier).toBe("../Shared/Card.tsazor");
    expect(context.resolveComponent("Nobody", [])).toBeNull();
  });

  it("resolves bare-package tags only for names the package exports (I4)", async () => {
    const context = await contextFor("Pages/Index.tsazor");
    expect(context.resolveComponent("Button", [])).toEqual({ specifier: "@fake/ui", exportName: "Button" });
    // Followed through `export * from "./extra.js"`.
    expect(context.resolveComponent("Theme", [])).toEqual({ specifier: "@fake/ui", exportName: "Theme" });
    // A typo is no longer trusted to exist in the package.
    expect(context.resolveComponent("Buton", [])).toBeNull();
    expect(packageExports("@fake/ui", root)?.has("Tooltip")).toBe(true);
  });

  it("reports a tag that resolves in more than one @using source as ambiguous", async () => {
    const context = await contextFor("Pages/Index.tsazor");
    // Card: ./Shared (via _Imports) and @fake/ui.
    expect(context.resolveComponent("Card", [])?.ambiguous).toEqual(["../Shared", "@fake/ui"]);
    // A file-level @using adds its directory as another source.
    expect(context.resolveComponent("Panel", ["../Other"])).toEqual({ specifier: "../Other/Panel.tsazor" });
    expect(context.resolveComponent("Card", ["../Other"])?.ambiguous).toEqual(["../Shared", "../Other", "@fake/ui"]);
  });

  it("lets enclosing directories win over @using sources (nearest namespace)", async () => {
    await writeFile(path.join(root, "Pages", "Card.tsazor"), "<div class='page-card'></div>\n");
    try {
      const context = await contextFor("Pages/Index.tsazor");
      expect(context.resolveComponent("Card", [])).toEqual({ specifier: "./Card.tsazor" });
    } finally {
      await rm(path.join(root, "Pages", "Card.tsazor"));
    }
  });

  it("searches every directory above the file, with or without an _Imports, as C#'s enclosing namespaces", async () => {
    // Pages/Admin has no _Imports: a component in Pages/Admin is in scope in Pages/Admin/Fields, and one at
    // the root in both.
    await mkdir(path.join(root, "Pages", "Admin", "Fields"), { recursive: true });
    await writeFile(path.join(root, "Pages", "Admin", "FieldBasics.tsazor"), "<div></div>\n");
    await writeFile(path.join(root, "RootOnly.tsazor"), "<div></div>\n");
    try {
      const context = await contextFor("Pages/Admin/Fields/StringFieldSettings.tsazor");
      expect(context.resolveComponent("FieldBasics", [])).toEqual({ specifier: "../FieldBasics.tsazor" });
      expect(context.resolveComponent("RootOnly", [])).toEqual({ specifier: "../../../RootOnly.tsazor" });
      // Not sideways: a sibling folder's component still needs a @using.
      expect(context.resolveComponent("Panel", [])).toBeNull();
    } finally {
      await rm(path.join(root, "Pages", "Admin", "FieldBasics.tsazor"));
      await rm(path.join(root, "RootOnly.tsazor"));
    }
  });

  it("imports @inject types the way the target file really exports them (I3)", async () => {
    const context = await contextFor("Pages/Index.tsazor");
    expect(context.resolveType("UserService", [])).toEqual({ specifier: "../UserService" });
    expect(context.resolveType("CounterService", [])).toEqual({ specifier: "../CounterService", exportName: "CounterService" });
    // Named wins when the file exports both (no guessing from the file name).
    expect(context.resolveType("Both", [])).toEqual({ specifier: "../Both", exportName: "Both" });
    expect(context.resolveType("EventCallback", [])?.exportName).toBe("EventCallback");
    expect(RUNTIME_TYPES.has("EventCallback")).toBe(true);
    expect(importKindOf(path.join(root, "Shared", "Card.tsazor"), "Card")).toBe("default");
  });

  it("resolves named exports of .ts modules in the candidate dirs (barrels)", async () => {
    const context = await contextFor("Pages/Index.tsazor");
    expect(context.resolveType("Address", [])).toMatchObject({ specifier: "../models", exportName: "Address" });
    expect(context.resolveType("Pizza", [])?.exportName).toBe("Pizza");
    // Unresolvable names still fall through — also for bare packages.
    expect(context.resolveType("UnknownModel", [])).toBeNull();
    expect(context.resolveType("Tooltip", [])).toEqual({ specifier: "@fake/ui", exportName: "Tooltip" });
  });

  it("never resolves JS globals or TS utility types to imports", async () => {
    const context = await contextFor("Pages/Index.tsazor");
    expect(context.resolveType("Math", [])).toBeNull();
    expect(context.resolveType("Date", [])).toBeNull();
    expect(context.resolveType("Record", [])).toBeNull();
    expect(context.resolveType("Partial", [])).toBeNull();
  });

  it("checks the file's own @using values", async () => {
    const context = await contextFor("Pages/Index.tsazor");
    expect(context.resolveUsing("../Shared")).toBeNull();
    expect(context.resolveUsing("@fake/ui")).toBeNull();
    expect(context.resolveUsing("./Missing")).toMatch(/does not exist/);
    expect(context.resolveUsing("System.Linq")).toMatch(/not installed/);
  });
});
