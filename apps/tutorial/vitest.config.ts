import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    supported: { decorators: false },
    tsconfigRaw: { compilerOptions: { target: "es2022" } },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "happy-dom",
    testTimeout: 60000,
  },
});
