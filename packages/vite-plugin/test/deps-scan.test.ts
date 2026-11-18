/**
 * The .tsazor files' bare imports go to optimizeDeps.include (Vite's dependency scan can't read .tsazor): only packages
 * the app depends on and installed from a registry (a workspace link isn't prebundled), no relative, virtual or
 * type-only imports.
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importSpecifiers, packageName, tsazorBareImports } from "../src/deps-scan";
import { tsazor } from "../src/index";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "tsazor-deps-"));
  dirs.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

/** Installs `names` in root/node_modules as a registry would, and links `linked` from a folder outside it. */
function install(root: string, names: string[], linked: string[] = []): void {
  for (const name of names) {
    mkdirSync(path.join(root, "node_modules", name), { recursive: true });
    writeFileSync(path.join(root, "node_modules", name, "package.json"), JSON.stringify({ name }));
  }
  for (const name of linked) {
    const source = path.join(root, "workspace", name);
    mkdirSync(source, { recursive: true });
    mkdirSync(path.dirname(path.join(root, "node_modules", name)), { recursive: true });
    symlinkSync(source, path.join(root, "node_modules", name), "junction");
  }
}

const manifest = JSON.stringify({
  dependencies: { "date-fns": "^4", "sleipnir-client": "^1.8", "@tsazor/runtime": "1.0.0", "@tsazor/dotnet": "1.0.0", "@tsazor/primitives": "1.0.0", "not-installed": "^1" },
  devDependencies: { vitest: "^3" },
});

describe("the .tsazor files' bare imports", () => {
  it("reads @import and import lines, leaves out type-only ones", () => {
    expect(importSpecifiers('@import { format } from "date-fns"\n@import type { X } from "y"\n@code {\n  import z from \'z/sub\';\n}\n@import "./side.css"')).toEqual([
      "date-fns",
      "z/sub",
      "./side.css",
    ]);
    expect([packageName("@scope/pkg/sub"), packageName("pkg/sub"), packageName("./x"), packageName("virtual:tsazor-routes")]).toEqual(["@scope/pkg", "pkg", undefined, undefined]);
  });

  it("keeps the app's installed dependencies; not a dev dependency, a workspace link, a missing install, a relative one", () => {
    const root = project({
      "package.json": manifest,
      "src/Pages/Home.tsazor": '@import { format } from "date-fns"\n@import { inject } from "@tsazor/runtime"\n@import Card from "./Card.tsazor"\n@import { x } from "not-a-dependency"',
      "src/Pages/Job.tsazor": '@import { SleipnirClient } from "sleipnir-client/sse"\n@import type { Job } from "date-fns"\n@import { problemMessage } from "@tsazor/dotnet"\n@import { y } from "not-installed"',
      "node_modules/lib/Inner.tsazor": '@import { y } from "vitest"',
      // A generated client only pages import, its test and a config: the client counts, the others don't.
      "src/api/models.ts": 'import { Decimal } from "@tsazor/primitives";\nimport type { Guid } from "@tsazor/primitives/guid";',
      "src/api/models.test.ts": 'import { expect } from "vitest";\nimport { x } from "sleipnir-client/test";',
      "vite.config.ts": 'import { defineConfig } from "date-fns/config";',
    });
    install(root, ["date-fns", "sleipnir-client", "@tsazor/dotnet", "@tsazor/primitives", "vitest"], ["@tsazor/runtime"]);
    expect(tsazorBareImports(root)).toEqual(["@tsazor/dotnet", "@tsazor/primitives", "date-fns", "sleipnir-client/sse"]);
  });

  it("the plugin's config hands them to optimizeDeps.include, unless discovery is off", () => {
    const root = project({ "package.json": manifest, "src/A.tsazor": '@import { format } from "date-fns"' });
    install(root, ["date-fns"]);
    const config = (tsazor({ root }).config as (config: object) => { optimizeDeps?: { include: string[] } })({});
    expect(config.optimizeDeps?.include).toEqual(["date-fns"]);
    const off = (tsazor({ root }).config as (config: object) => { optimizeDeps?: unknown })({ optimizeDeps: { noDiscovery: true } });
    expect(off.optimizeDeps).toBeUndefined();
  });
});
