import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
        target: "es2022",
      },
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "happy-dom",
  },
});