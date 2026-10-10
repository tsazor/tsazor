import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    // Standard decorators: Node does not run them natively, esbuild lowers them.
    supported: { decorators: false },
    tsconfigRaw: { compilerOptions: { target: "es2022" } },
  },
  test: {
    include: ["test/**/*.test.ts"],
    // jsdom, not happy-dom: DOMPurify doesn't sanitize under happy-dom (it keeps `onerror`), and jsdom loads nothing.
    environment: "jsdom",
  },
});
