import { build } from "esbuild";
import { mkdir } from "node:fs/promises";

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

// Language server: bundles @tasor/compiler + @tasor/workspace + the LSP
// protocol runtime, so the VSIX ships a single self-contained server file.
await build({
  entryPoints: ["../lsp/src/server.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: "dist/server.js",
});

console.log("built dist/extension.js and dist/server.js");