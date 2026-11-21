import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { tsazor } from "@tsazor/vite-plugin";
import { tutorialPlugin } from "./build/vite-tutorial";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // GitHub Pages serves the tutorial below the repository name (TUTORIAL_BASE=/Tsazor/).
  base: process.env.TUTORIAL_BASE ?? "/",
  plugins: [tsazor(), tutorialPlugin({ root })],
  server: {
    port: 5330,
    strictPort: true,
  },
  worker: {
    format: "es",
    // The compile worker imports virtual:tutorial-types.
    plugins: () => [tutorialPlugin({ root })],
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
