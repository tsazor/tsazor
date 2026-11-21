import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
    // The generated clients are type-checked (a TypeScript program each): over 5 s with every package testing at once.
    testTimeout: 30_000,
  },
});