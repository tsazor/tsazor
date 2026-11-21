/**
 * The component manifest across versions (D10, docs/component-libraries.md): a manifest Tsazor 1.0 wrote reads in
 * every 1.x; fields a reader doesn't know are ignored; a newer format version is a warning and still reads; an
 * unreadable manifest is an error (TZS036), not a silent TZS005 for each of its tags.
 */
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MetadataCache } from "../src/index.js";

const FIXTURE = path.join(import.meta.dirname, "fixtures", "manifest-1.0");
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

/** An app root with the 1.0 fixture installed as `legacy-lib`; `change` edits its manifest first. */
async function appWithLibrary(change?: (manifest: Record<string, unknown>) => unknown): Promise<{ root: string; manifestFile: string }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "tsazor-manifest-"));
  roots.push(root);
  const libDir = path.join(root, "node_modules", "legacy-lib");
  await mkdir(libDir, { recursive: true });
  await cp(FIXTURE, libDir, { recursive: true });
  const manifestFile = path.join(libDir, "tsazor-components.json");
  if (change) {
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as Record<string, unknown>;
    const changed = change(manifest);
    await writeFile(manifestFile, typeof changed === "string" ? changed : JSON.stringify(changed ?? manifest));
  }
  return { root, manifestFile };
}

const parameterNames = (cache: MetadataCache, root: string, component: string) =>
  cache.packageManifest("legacy-lib", root)?.manifest.components[component]?.parameters.map((parameter) => parameter.name);

describe("the component manifest across versions (D10)", () => {
  it("reads the manifest Tsazor 1.0 wrote: parameters, inherited ones, type parameters", async () => {
    const { root } = await appWithLibrary();
    const cache = new MetadataCache();
    expect(parameterNames(cache, root, "Badge")?.slice(0, 2)).toEqual(["intent", "pill"]);
    expect(parameterNames(cache, root, "DatePicker")?.slice(0, 3)).toEqual(["value", "valueChanged", "valueExpression"]);
    const grid = cache.packageManifest("legacy-lib", root)!.manifest.components.DataGrid!;
    expect(grid.typeParameters.map((parameter) => parameter.name)).toEqual(["TGridItem"]);
    expect(grid.file).toBe(path.join(root, "node_modules", "legacy-lib", "src", "DataGrid.tsazor"));
    expect(cache.manifestProblems()).toEqual([]);
  });

  it("ignores the fields it doesn't know (a later 1.x adds optional ones)", async () => {
    const { root } = await appWithLibrary((manifest) => {
      const components = manifest.components as Record<string, Record<string, unknown> & { parameters: Record<string, unknown>[] }>;
      manifest.generator = "tsazor 1.9";
      components.Badge!.since = "1.9";
      components.Badge!.parameters[0]!.deprecated = { message: "use tone" };
    });
    const cache = new MetadataCache();
    expect(parameterNames(cache, root, "Badge")?.slice(0, 2)).toEqual(["intent", "pill"]);
    expect(cache.manifestProblems()).toEqual([]);
  });

  it("reports a newer format version as a warning and still reads what it knows", async () => {
    const { root, manifestFile } = await appWithLibrary((manifest) => ({ ...manifest, tsazorComponentManifest: 2 }));
    const cache = new MetadataCache();
    expect(parameterNames(cache, root, "Button")).toContain("intent");
    expect(cache.manifestProblems()).toEqual([
      {
        packageName: "legacy-lib",
        file: manifestFile,
        severity: "warning",
        message:
          'The component manifest of "legacy-lib" is format version 2, newer than this Tsazor reads (1): update Tsazor, or use a release of the package built for this one.',
      },
    ]);
  });

  it("reports an unreadable manifest as an error instead of leaving each tag unresolved", async () => {
    const { root } = await appWithLibrary(() => "{ not json");
    const cache = new MetadataCache();
    expect(cache.packageManifest("legacy-lib", root)).toBeUndefined();
    expect(cache.manifestProblems()).toMatchObject([{ packageName: "legacy-lib", severity: "error", message: expect.stringMatching(/^The component manifest of "legacy-lib" can't be read \(/) }]);

    const { root: other } = await appWithLibrary(() => ({ tsazorComponentManifest: 1 }));
    const fresh = new MetadataCache();
    expect(fresh.packageManifest("legacy-lib", other)).toBeUndefined();
    expect(fresh.manifestProblems()).toMatchObject([{ severity: "error", message: 'The component manifest of "legacy-lib" is not a component manifest (no `components`).' }]);
  });
});
