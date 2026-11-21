import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Pure value types: no DOM. `Guid.newGuid()` uses `crypto.randomUUID`, which Node exposes.
    environment: "node",
  },
});
