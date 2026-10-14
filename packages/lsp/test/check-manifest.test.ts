/**
 * D10: `tsazor check` reports a package's component manifest that can't be read, or is newer than this Tsazor, as
 * TZS036 — instead of a silent TZS005 for each of its tags.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkProject } from "../src/check";

let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function appUsing(manifest: string): Promise<string> {
  root = await mkdtemp(path.join(tmpdir(), "tsazor-manifest-check-"));
  await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "bundler" } }));
  const lib = path.join(root, "node_modules", "fancy-lib");
  await mkdir(lib, { recursive: true });
  await writeFile(path.join(lib, "package.json"), JSON.stringify({ name: "fancy-lib", exports: { ".": "./index.js" }, tsazor: { components: "./tsazor-components.json" } }));
  await writeFile(path.join(lib, "index.js"), "export {};\n");
  await writeFile(path.join(lib, "tsazor-components.json"), manifest);
  await writeFile(path.join(root, "Page.tsazor"), '@import { Fancy } from "fancy-lib"\n<Fancy />\n');
  return root;
}

const manifestDiagnostics = async (dir: string) =>
  (await checkProject(dir, { tsDiagnostics: false })).diagnostics
    .filter((d) => d.code === "TZS036" || d.code === "TZS005")
    .map((d) => ({ code: d.code, severity: d.severity, file: path.basename(d.file), message: d.message }));

describe("tsazor check: the component manifest (D10)", () => {
  it("reports an unreadable manifest as TZS036, at the manifest", async () => {
    expect(await manifestDiagnostics(await appUsing("{ not json"))).toEqual([{
      code: "TZS036",
      severity: "error",
      file: "tsazor-components.json",
      message: expect.stringMatching(/^The component manifest of "fancy-lib" can't be read/),
    }]);
  });

  it("reports a newer format version as a warning and resolves what it knows", async () => {
    const manifest = { tsazorComponentManifest: 2, components: { Fancy: { name: "Fancy", isComponent: true, typeParameters: [], parameters: [] } } };
    expect(await manifestDiagnostics(await appUsing(JSON.stringify(manifest)))).toEqual([
      {
        code: "TZS036",
        severity: "warning",
        file: "tsazor-components.json",
        message: 'The component manifest of "fancy-lib" is format version 2, newer than this Tsazor reads (1): update Tsazor, or use a release of the package built for this one.',
      },
    ]);
  });
});
