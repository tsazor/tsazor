/**
 * Roadmap 2.4: the optional `check: true` hook (`runBuildCheck`) — the same
 * `tsazor check` pipeline as the CLI, invoked at a build's end. A project
 * whose components use attributes against their parameter types reports the
 * TS findings mapped back to `.tsazor` source positions; a clean project
 * reports none.
 */
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { formatCheckDiagnostic, runBuildCheck } from "../src/check-hook";

let roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function makeProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "tsazor-check-"));
  roots.push(root);
  // The project's @tsazor/runtime: the workspace's own package, linked as pnpm links it (without it, the check
  // reports the unresolved runtime import — the classes have no base to check against).
  await mkdir(path.join(root, "node_modules", "@tsazor"), { recursive: true });
  await symlink(fileURLToPath(new URL("../../runtime", import.meta.url)), path.join(root, "node_modules", "@tsazor", "runtime"), "junction");
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return root;
}

describe("runBuildCheck (vite `check: true`)", () => {
  it("reports no diagnostics for a clean project", async () => {
    const root = await makeProject({
      "Greeter.tsazor": "<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name: string = \"world\";\n}\n",
    });
    let errorCount = 0;
    const diagnostics = await runBuildCheck(root, () => {
      errorCount++;
    });
    expect(diagnostics).toHaveLength(0);
    expect(errorCount).toBeGreaterThanOrEqual(1); // the summary line only
  });

  it("fails the hook with a mapped TS finding for a wrong attribute value", async () => {
    const root = await makeProject({
      "_Imports.tsazor": '@import { Greeter } from "./Greeter.tsazor"\n',
      "Counter.tsazor": '<Greeter Name="@this.count" />\n\n@code {\n    private count = 1;\n}\n',
      "Greeter.tsazor": "<p>Hello, @Name!</p>\n\n@code {\n    @Parameter() Name?: string;\n}\n",
    });
    const diagnostics = await runBuildCheck(root, () => {});
    const finding = diagnostics.find((d) => d.code.startsWith("TS"));
    expect(finding).toBeDefined();
    expect(finding!.file.endsWith(path.join(root, "Counter.tsazor"))).toBe(true);
  });

  it("formats diagnostics project-positively like the CLI", () => {
    const root = "D:/proj";
    const line = formatCheckDiagnostic(root, {
      file: "D:/proj/src/Pages/X.tsazor",
      line: 4,
      column: 11,
      code: "TS1360",
      severity: "error",
      message: "nope",
    });
    expect(line).toBe("src/Pages/X.tsazor(4,11) TS1360 nope");
  });
});