/**
 * Library build for @tsazor/bootstrap: compiles every src/*.tsazor through the
 * real compiler + workspace resolution, transpiles with esbuild and rewrites
 * sibling .tsazor imports to the built .js outputs. The bundle itself is
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
  // The bundled compiler pulls in TypeScript (CommonJS: require, __filename).
  banner: {
    js: [
      'import { createRequire as __tsazorRequire } from "node:module";',
      'import { fileURLToPath as __tsazorPath } from "node:url";',
      "const require = __tsazorRequire(import.meta.url);",
      "const __filename = __tsazorPath(import.meta.url);",
      'const __dirname = __tsazorPath(new URL(".", import.meta.url));',
    ].join(" "),
  },
  logLevel: "silent",
});

await import(pathToFileURL(".build/runner.mjs").href);