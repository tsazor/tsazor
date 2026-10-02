import { defineConfig } from "vitest/config";

// Own config so `pnpm -r test` (run inside the package) doesn't pick up the
// root `projects` list, whose paths are relative to the repo root.
export default defineConfig({
  test: {
    environment: "node",
  },
});
