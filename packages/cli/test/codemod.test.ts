/**
 * 2.5 — `tsazor codemod` (packages/cli): walk, dry-run and `--write` over a
 * fixture tree, plus the CLI main() usage contract. The transform itself is
 * covered in @tsazor/compiler's codemod.test.ts.
 */
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { codemodProject, findRazorFiles } from "../src/codemod";
import { main } from "../src/index";

let root = "";

const FOREACH = [
  "<ul>",
  '@foreach (var item in Items)',
  "{",
  '    <li>@($"p{item}.txt")</li>',
  "}",
  "</ul>",
  "",
].join("\n");

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-codemod-"));
  await mkdir(path.join(root, "pages", "bin"), { recursive: true });
  writeFileSync(path.join(root, "pages", "List.razor"), FOREACH);
  // bin/obj contents are C# build output, never codemod input.
  writeFileSync(path.join(root, "pages", "bin", "Gen.razor"), "<p>generated</p>");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("tsazor codemod", () => {
  it("finds the .razor files, skipping bin/obj", () => {
    expect(findRazorFiles(root)).toEqual([path.join(root, "pages", "List.razor").replace(/\\/g, "/")]);
  });

  it("dry-run reports and writes nothing", async () => {
    const report = await codemodProject(root);
    expect(report.files).toHaveLength(1);
    expect(report.applied).toBe(2); // TZS021 foreach + TZS024 interpolated
    expect(report.withRemainingErrors).toBe(0);
    expect(existsSync(path.join(root, "pages", "List.tsazor"))).toBe(false);
  });

  it("--write puts List.tsazor beside the source and keeps List.razor", async () => {
    const report = await codemodProject(root, { write: true });
    expect(report.files[0]!.target).toBe(path.join(root, "pages", "List.tsazor").replace(/\\/g, "/"));
    expect(await readFile(path.join(root, "pages", "List.tsazor"), "utf8")).toBe(
      ["<ul>", "@foreach (const item of Items)", "{", '    <li>@(`p${item}.txt`)</li>', "}", "</ul>", ""].join("\n"),
    );
    expect(existsSync(path.join(root, "pages", "List.razor"))).toBe(true);
  });

  it("main() prints usage on an unknown command and the summary on codemod", async () => {
    const lines: string[] = [];
    expect(await main(["node", "tsazor", "nope"], (l) => lines.push(l))).toBe(2);
    expect(lines[0]).toBe("Usage: tsazor check [project-root]");
    expect(lines.join("\n")).toContain("Usage: tsazor codemod <path> [--write]");

    const out: string[] = [];
    expect(await main(["node", "tsazor", "codemod", path.join(root, "pages")], (l) => out.push(l))).toBe(0);
    expect(out.join("\n")).toContain("./List.razor → ./List.tsazor: 2 fix(es)");
    expect(out.at(-1)).toContain("(dry-run — pass --write)");
  });

  it("main() reports a missing input tree", async () => {
    const out: string[] = [];
    expect(await main(["node", "tsazor", "codemod", path.join(root, "nowhere")], (l) => out.push(l))).toBe(1);
    expect(out.join("\n")).toContain("no .razor files");
  });
});