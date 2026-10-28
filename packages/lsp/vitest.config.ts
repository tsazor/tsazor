import { defineConfig } from "vitest/config";

// Own config so `pnpm -r test` (run inside the package) doesn't pick up the
// root `projects` list, whose paths are relative to the repo root.
export default defineConfig({
  test: {
    environment: "node",
    // Each test builds a TypeScript program: about a second alone, over vitest's 5 s with every package testing at
    // once (`pnpm -r test`, public-tree --verify).
    testTimeout: 30_000,
  },
});
