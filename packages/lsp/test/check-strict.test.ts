/**
 * S2: `tsazor check` warns (TSZSTRICT) about a tsconfig that is not strict —
 * strict TypeScript is the only supported configuration.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkProject } from "../src/check";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function project(compilerOptions: Record<string, unknown>): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-strict-"));
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", ...compilerOptions } }));
  await writeFile(path.join(root, "Hello.tsazor"), "<p>Hello</p>\n");
  return root;
}

const strictWarnings = async (dir: string) =>
  (await checkProject(dir)).diagnostics.filter((d) => d.code === "TSZSTRICT").map((d) => ({ severity: d.severity, file: path.basename(d.file), message: d.message }));

describe("tsazor check: strict TypeScript (S2)", () => {
  it("is quiet for a strict tsconfig", async () => {
    expect(await strictWarnings(await project({ strict: true }))).toEqual([]);
  });

  it("warns once when strict is off", async () => {
    expect(await strictWarnings(await project({}))).toEqual([
      { severity: "warning", file: "tsconfig.json", message: expect.stringMatching(/^'strict' is not on\. Tsazor supports strict TypeScript only/) },
    ]);
  });

  it("names the strict flags switched off again", async () => {
    const [warning] = await strictWarnings(await project({ strict: true, strictNullChecks: false, noImplicitAny: false }));
    expect(warning!.message).toMatch(/^'noImplicitAny', 'strictNullChecks' are switched off\./);
  });
});
