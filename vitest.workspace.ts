import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/runtime",
  "packages/compiler",
  "packages/vite-plugin",
  "packages/testing",
]);