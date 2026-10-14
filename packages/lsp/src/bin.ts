#!/usr/bin/env node
/**
 * `tsazor-lsp`: the language server over stdio, for editors other than VS Code (`--stdio` unless another transport
 * — `--node-ipc`, `--socket=` — is given).
 */
if (!process.argv.some((arg) => arg === "--stdio" || arg === "--node-ipc" || arg.startsWith("--socket") || arg.startsWith("--pipe"))) {
  process.argv.push("--stdio");
}
await import("./server.js");
