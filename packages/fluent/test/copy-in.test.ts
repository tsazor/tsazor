/**
 * The copy-in CLI (`npx @tsazor/fluent add <Component>`): a copied component brings every file it imports, so the
 * copy compiles on its own. Before 2026-10-10 it followed only the sibling tags in the markup, and a copied Alert
 * missed attributes.ts, vocabulary.ts and core-icons.ts (L3). The CLI runs once for real; every component's closure
 * is checked in-process (bin/closure.mjs), not with a process each.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
// @ts-expect-error: a plain .mjs module without declarations.
import { availableComponents, collectClosure } from "../bin/closure.mjs";

const cli = path.resolve(import.meta.dirname, "..", "bin", "fluent.mjs");
const src = path.resolve(import.meta.dirname, "..", "src");
const work = mkdtempSync(path.join(tmpdir(), "tsazor-fluent-add-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const components: string[] = availableComponents(src);

/** The relative imports of a component's files that don't resolve among them. */
function unresolved(files: { file: string; source: string }[]): string[] {
  const names = new Set(files.map((entry) => entry.file));
  const missing: string[] = [];
  for (const { file, source } of files) {
    for (const match of source.matchAll(/\bfrom\s+["']\.\/([^"']+)["']/g)) {
      const spec = match[1]!;
      const stem = spec.replace(/\.(js|ts)$/, "");
      const candidates = spec.endsWith(".tsazor") ? [spec] : [`${stem}.ts`, `${stem}.tsazor`];
      if (!candidates.some((candidate) => names.has(candidate))) missing.push(`${file} → ./${spec}`);
    }
  }
  return missing;
}

// Child processes: well under a second alone, over vitest's 5 s with every package testing at once.
describe("npx @tsazor/fluent add", { timeout: 60_000 }, () => {
  it("lists the components", () => {
    expect(execFileSync(process.execPath, [cli, "list"], { encoding: "utf8" })).toContain("  Alert");
    expect(components).toContain("Alert");
    expect(components.length).toBeGreaterThan(40);
  });

  it("copies every module a component imports (Alert: attributes, vocabulary, core icons, Icon)", () => {
    const root = path.join(work, "alert");
    execFileSync(process.execPath, [cli, "add", "Alert", "--root", root], { encoding: "utf8" });
    expect(readdirSync(path.join(root, "src", "components")).sort()).toEqual([
      "Alert.tsazor", "Alert.tsazor.css", "Icon.tsazor", "Icon.tsazor.css", "attributes.ts", "core-icons.ts", "vocabulary.ts",
    ]);
  });

  it("every component's copy resolves its own imports", () => {
    const missing: string[] = [];
    for (const name of components) missing.push(...unresolved(collectClosure(src, name)).map((entry) => `${name}: ${entry}`));
    expect(missing).toEqual([]);
  });
});

describe("npx @tsazor/fluent add <Template>", { timeout: 60_000 }, () => {
  /** The templates' dir: a template's closure over there (its own modules, not the components']). */
  const templates = path.resolve(import.meta.dirname, "..", "templates");
  const templateNames = readdirSync(templates).filter((name) => name.endsWith(".tsazor") && name !== "_Imports.tsazor").map((name) => name.replace(/.tsazor$/, ""));

  it("lists them beside the components", () => {
    const listing = execFileSync(process.execPath, [cli, "list"], { encoding: "utf8" });
    expect(listing).toContain("Available templates");
    expect(templateNames.length).toBeGreaterThan(0);
  });

  for (const name of templateNames) {
    it(`closes ${name} with its own modules (.tsazor, sidecar css, the model .ts)`, () => {
      const closure = collectClosure(templates, name);
      expect(closure.map((entry) => entry.file).sort()).toEqual(expect.arrayContaining([`${name}.tsazor`]));
      // The closure's files carry no unresolved relative import (the copy compiles on its own).
      expect(unresolved(closure)).toEqual([]);
    });
  }

  it("copies a template into the app's src/Pages with its modules, and says so", () => {
    if (templateNames.length === 0) return;
    const output = execFileSync(process.execPath, [cli, "add", templateNames[0]!, "--root", path.join(work, "add-template"), "--print"], { encoding: "utf8" });
    expect(output).toContain("Pages");
    expect(output).toContain("(a template: it lands in your src/Pages and is yours)");
  });
});
