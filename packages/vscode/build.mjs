import { build } from "esbuild";
import { mkdir, copyFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

await mkdir("dist", { recursive: true });

// Extension entry: vscode-languageclient bundled, the vscode API external.
await build({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/extension.js",
});

// Language server: bundles @tsazor/compiler + @tsazor/workspace + the LSP
// protocol runtime + typescript itself, so the VSIX ships a single
// self-contained server file (~8–9 MB — whole-tsc is deliberately bundled, a
// whole typescript *package* would be ~70 MB).
await build({
  entryPoints: ["../lsp/src/server.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/server.js",
});

// TS lib files: the bundled server cannot resolve the typescript package
// (pnpm: the package root owns node_modules), so the server's host falls
// back to dist/lib — populated here from the lsp package's typescript.
// Resolving via the lsp package also FAILS the build early when the lsp
// deps are not installed (build ordering: pnpm install first).
const lspRequire = createRequire(path.resolve("../lsp/package.json"));
// resolve("typescript") → <pkg>/lib/typescript.js — its dirname IS the lib dir.
const libDir = path.dirname(lspRequire.resolve("typescript"));
await mkdir(path.join("dist", "lib"), { recursive: true });
let libCount = 0;
for (const source of await (await import("node:fs/promises")).readdir(libDir)) {
  if (!source.startsWith("lib.") || !source.endsWith(".d.ts")) continue;
  await copyFile(path.join(libDir, source), path.join("dist", "lib", source));
  libCount++;
}

const serverSize = (await stat("dist/server.js")).size;
console.log(
  `built dist/extension.js and dist/server.js (${(serverSize / 1024 / 1024).toFixed(1)} MB, ${libCount} lib d.ts files copied to dist/lib)`,
);