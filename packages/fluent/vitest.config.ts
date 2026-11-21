import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    // Standard decorators: Node does not run them natively, esbuild lowers them.
    supported: { decorators: false },
    tsconfigRaw: { compilerOptions: { target: "es2022" } },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "happy-dom",
  },
});