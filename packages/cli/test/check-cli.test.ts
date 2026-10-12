/**
 * `tsazor check` without a project root checks the current directory (the
 * documented `[project-root]` default). It used to return 0 without checking
 * anything, so `tsazor check && vite build` gates passed vacuously.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main } from "../src/index";

let root = "";
const cwd = process.cwd();

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-check-cli-"));
  // An unclosed explicit expression: a compiler error the check must report.
  writeFileSync(path.join(root, "Broken.tsazor"), "<p>@(1 + </p>\n");
});

afterAll(async () => {
  process.chdir(cwd);
  await rm(root, { recursive: true, force: true });
});

describe("tsazor check — default root", () => {
  it("without a root checks the current directory and fails on errors", async () => {
    process.chdir(root);
    const out: string[] = [];
    try {
      expect(await main(["node", "tsazor", "check"], (l) => out.push(l))).toBe(1);
    } finally {
      process.chdir(cwd);
    }
    expect(out.join("\n")).toContain("Broken.tsazor(");
    expect(out.at(-1)).toMatch(/^tsazor check: 1 file\(s\), [1-9]\d* error\(s\)/);
  });

  it("--help prints the usage and exits 0; codemod without a path is a usage error", async () => {
    const help: string[] = [];
    expect(await main(["node", "tsazor", "check", "--help"], (l) => help.push(l))).toBe(0);
    expect(help[0]).toBe("Usage: tsazor check [project-root]");

    const codemod: string[] = [];
    expect(await main(["node", "tsazor", "codemod"], (l) => codemod.push(l))).toBe(2);
    expect(codemod).toEqual(["Usage: tsazor codemod <path> [--write]"]);
  });
});

describe("tsazor --version", () => {
  it("prints the package's version, the one every package has (it was a constant, two releases behind)", async () => {
    const out: string[] = [];
    const { version } = JSON.parse(readFileSync(path.join(__dirname, "..", "package.json"), "utf8")) as { version: string };
    expect(await main(["node", "tsazor", "--version"], (l) => out.push(l))).toBe(0);
    expect(out).toEqual([`tsazor ${version}`]);
  });
});
