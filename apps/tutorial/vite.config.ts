import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { tsazor } from "@tsazor/vite-plugin";
import { tutorialPlugin } from "./build/vite-tutorial";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [tsazor(), tutorialPlugin({ root })],
  server: {
    port: 5330,
    strictPort: true,
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    // The compiler worker carries TypeScript (~9 MB unminified).
    chunkSizeWarningLimit: 12000,
  },
  optimizeDeps: {
    include: ["typescript"],
  },
});
