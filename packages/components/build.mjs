/**
 * Library build for @tasor/components: compiles every src/*.tazor through the
 * real compiler + workspace resolution, transpiles with esbuild and rewrites
 * sibling .tazor imports to the built .js outputs. The bundle itself is
 * esbuild-bundled to a scratch runner first (raw node ESM cannot load the
 * compiler's extensionless dist imports).
 */
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

await build({
  entryPoints: ["scripts/build-entry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".build/runner.mjs",
  external: ["esbuild", "node:*"],
  logLevel: "silent",
});

await import(pathToFileURL(".build/runner.mjs").href);