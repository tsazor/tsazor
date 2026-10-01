/**
 * 2.5 — LSP projektweit: per-app tsconfig projects, dependent re-checks and
 * mapped diagnostic ranges. In-memory fixtures over a temp workspace, no
 * VS Code (same pattern as the other lsp tests).
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProjectRegistry } from "../src/projects";
import { findNearestTsconfig, pathWithin, tsDiagnostics } from "../src/index";

let root = "";

const RUNTIME_DTS = [
  "export declare class RenderTreeBuilder {",
  "  openElement(seq: number, name?: string): void;",
  "  closeElement(): void;",
  "  openComponent(seq: number, type: unknown): void;",
  "  closeComponent(): void;",
  "  openRegion(seq: number): void;",
  "  closeRegion(): void;",
  "  addAttribute(seq: number, name: string, value?: unknown): void;",
  "  addContent(seq: number, value: unknown): void;",
  "}",
  "export declare class ComponentBase {",
  "  protected buildRenderTree(b: RenderTreeBuilder): void {}",
  "}",
  "export declare function Parameter(options?: { captureUnmatchedValues?: boolean }): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext) => void;",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-projects-"));
  // node_modules stub so the runtime imports resolve (same pattern as check.test).
  await mkdir(path.join(root, "node_modules", "@tsazor", "runtime"), { recursive: true });
  await writeFile(path.join(root, "node_modules", "@tsazor", "runtime", "package.json"), JSON.stringify({ name: "@tsazor/runtime", version: "0.1.0", types: "./index.d.ts" }));
  await writeFile(path.join(root, "node_modules", "@tsazor", "runtime", "index.d.ts"), RUNTIME_DTS);

  // Two apps, each with its own tsconfig, plus a folder without one.
  await mkdir(path.join(root, "apps", "one", "Shared"), { recursive: true });
  await mkdir(path.join(root, "apps", "two", "Shared"), { recursive: true });
  await mkdir(path.join(root, "loose"), { recursive: true });
  await writeFile(path.join(root, "apps", "one", "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
  await writeFile(path.join(root, "apps", "two", "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: false } }));
  for (const app of ["one", "two"]) {
    await writeFile(
      path.join(root, "apps", app, "Shared", "Leaf.tsazor"),
      '<span>@Variant</span>\n\n@code {\n    @Parameter() Variant?: string;\n}\n',
    );
  }
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsconfig routing (per-app options)", () => {
  it("routes a file to the nearest tsconfig above it", () => {
    const registry = new ProjectRegistry([root]);
    try {
      const one = registry.projectFor(path.join(root, "apps", "one", "Shared", "Leaf.tsazor"));
      const two = registry.projectFor(path.join(root, "apps", "two", "Shared", "Leaf.tsazor"));
      expect(one.configPath).toBe(path.join(root, "apps", "one", "tsconfig.json"));
      expect(two.configPath).toBe(path.join(root, "apps", "two", "tsconfig.json"));
      expect(one).not.toBe(two);
      // No config anywhere above → the workspace folder root (defaults).
      const loose = registry.projectFor(path.join(root, "loose", "Loose.tsazor"));
      expect(loose.configPath).toBeUndefined();
      expect(loose.root).toBe(root);
    } finally {
      registry.dispose();
    }
  });

  it("routes by workspace folder in a multi-root setup", () => {
    const one = path.join(root, "apps", "one");
    const two = path.join(root, "apps", "two");
    const registry = new ProjectRegistry([one, two]);
    try {
      expect(registry.projectFor(path.join(one, "Shared", "Leaf.tsazor")).root).toBe(one);
      expect(registry.projectFor(path.join(two, "Shared", "Leaf.tsazor")).root).toBe(two);
    } finally {
      registry.dispose();
    }
  });

  it("finds the nearest config walking up (findNearestTsconfig)", () => {
    expect(findNearestTsconfig(path.join(root, "apps", "one", "Shared"), root)).toBe(path.join(root, "apps", "one", "tsconfig.json"));
    expect(findNearestTsconfig(path.join(root, "loose"), root)).toBeUndefined();
    expect(pathWithin(path.join(root, "apps", "one", "x"), root)).toBe(true);
    expect(pathWithin(path.dirname(root), root)).toBe(false);
  });

  it("dropping a tsconfig rebuilds the project it owns", () => {
    const registry = new ProjectRegistry([root]);
    try {
      const leaf = path.join(root, "apps", "two", "Shared", "Leaf.tsazor");
      const before = registry.projectFor(leaf);
      registry.projectChanged(path.join(root, "apps", "two", "tsconfig.json"));
      const after = registry.projectFor(leaf);
      expect(after.service).not.toBe(before.service);
    } finally {
      registry.dispose();
    }
  });
});

describe("dependents (re-check after a dependency changed)", () => {
  it("rebuilds the shadow import edges and solves dependentsOf transitively", async () => {
    const dir = path.join(root, "apps", "one", "deps");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "Leaf.tsazor"), '<span>@Variant</span>\n\n@code {\n    @Parameter() Variant?: string;\n}\n');
    await writeFile(path.join(dir, "Uses.tsazor"), "<Leaf Variant=\"x\" />\n");
    await writeFile(path.join(dir, "Indirect.tsazor"), "<Uses />\n");
    const registry = new ProjectRegistry([root]);
    try {
      await registry.ensureTsazor(path.join(dir, "Leaf.tsazor"));
      await registry.ensureTsazor(path.join(dir, "Uses.tsazor"));
      await registry.ensureTsazor(path.join(dir, "Indirect.tsazor"));
      const dependents = registry.dependentsOf(path.join(dir, "Leaf.tsazor")).map((f) => path.basename(f));
      expect(dependents.sort()).toEqual(["Indirect.tsazor", "Uses.tsazor"]);
    } finally {
      registry.dispose();
    }
  });

  it("an _Imports change reports every file of its subtree", async () => {
    const dir = path.join(root, "apps", "one", "nested");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "_Imports.tsazor"), "");
    await writeFile(path.join(dir, "Below.tsazor"), "<p></p>\n");
    const registry = new ProjectRegistry([root]);
    try {
      await registry.ensureTsazor(path.join(dir, "Below.tsazor"));
      await registry.ensureTsazor(path.join(root, "apps", "one", "Shared", "Leaf.tsazor"));
      const dependents = registry.dependentsOf(path.join(dir, "_Imports.tsazor")).map((f) => path.basename(f));
      expect(dependents).toEqual(["Below.tsazor"]);
    } finally {
      registry.dispose();
    }
  });
});

describe("mapped TS diagnostic ranges", () => {
  it("carries the failing token's end position, not a one-character stub", async () => {
    const dir = path.join(root, "loose");
    await writeFile(
      path.join(dir, "Bad.tsazor"),
      '<p>x</p>\n\n@code {\n    priceText: string = 42;\n}\n',
    );
    const registry = new ProjectRegistry([root]);
    try {
      const entry = await registry.ensureTsazor(path.join(dir, "Bad.tsazor"));
      expect(entry).not.toBeNull();
      const diags = tsDiagnostics(registry.projectFor(path.join(dir, "Bad.tsazor")).service, entry as NonNullable<typeof entry>);
      const ts2322 = diags.find((d) => d.code === 2322);
      expect(ts2322).toBeDefined();
      if (!ts2322) return;
      expect(ts2322.line).toBe(3);
      expect(ts2322.endLine).toBe(ts2322.line);
      expect(ts2322.endCharacter).toBeGreaterThan(ts2322.character + 1);
    } finally {
      registry.dispose();
      await rm(path.join(dir, "Bad.tsazor"), { force: true });
    }
  });
});