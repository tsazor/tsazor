/**
 * The copy-in CLI (`npx @tsazor/fluent add <Component>`): a copied component brings every file it imports, so the
 * copy compiles on its own. Before 2026-10-10 it followed only the sibling tags in the markup, and a copied Alert
 * missed attributes.ts, vocabulary.ts and core-icons.ts.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const cli = path.resolve(import.meta.dirname, "..", "bin", "fluent.mjs");
const work = mkdtempSync(path.join(tmpdir(), "tsazor-fluent-add-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const components = execFileSync(process.execPath, [cli, "list"], { encoding: "utf8" })
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => /^[A-Z]\w*$/.test(line));

/** The relative imports of the copied files that don't resolve among them. */
function unresolved(dir: string): string[] {
  const missing: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!/\.(tsazor|ts)$/.test(file)) continue;
    for (const match of readFileSync(path.join(dir, file), "utf8").matchAll(/\bfrom\s+["']\.\/([^"']+)["']/g)) {
      const spec = match[1]!;
      const stem = spec.replace(/\.(js|ts)$/, "");
      const candidates = spec.endsWith(".tsazor") ? [spec] : [`${stem}.ts`, `${stem}.tsazor`];
      if (!candidates.some((candidate) => existsSync(path.join(dir, candidate)))) missing.push(`${file} → ./${spec}`);
    }
  }
  return missing;
}

describe("npx @tsazor/fluent add", () => {
  it("lists the components", () => {
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
    for (const name of components) {
      const root = path.join(work, name);
      execFileSync(process.execPath, [cli, "add", name, "--root", root], { encoding: "utf8" });
      missing.push(...unresolved(path.join(root, "src", "components")).map((entry) => `${name}: ${entry}`));
    }
    expect(missing).toEqual([]);
  }, 120_000);
});
