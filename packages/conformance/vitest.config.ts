import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const src = (pkg: string) => fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url));

/**
 * Suites run against package *sources*: compiler/workspace/runtime changes are
 * visible without a rebuild, and snippet modules compiled by the harness share
 * the same runtime instance as the test (both resolve @tsazor/runtime here).
 */
export default defineConfig({
  resolve: {
    alias: {
      // Before "@tsazor/runtime", which would take the subpath as a path under src/index.ts.
      "@tsazor/runtime/internal": fileURLToPath(new URL("../runtime/src/internal.ts", import.meta.url)),
      "@tsazor/runtime": src("runtime"),
      "@tsazor/compiler": src("compiler"),
      "@tsazor/workspace": src("workspace"),
    },
  },
  esbuild: {
    // Standard decorators: Node does not run them natively, esbuild lowers them.
    supported: { decorators: false },
    tsconfigRaw: { compilerOptions: { target: "es2022" } },
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
});
