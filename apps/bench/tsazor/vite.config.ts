import { defineConfig, type Plugin } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

// `--mode router` builds the app with Tsazor's Router in hash mode (src/RouterProgram.ts) into dist-router; the
// default build switches views by hand, as the JS apps do (src/Program.ts).
const routerEntry: Plugin = {
  name: "bench-router-entry",
  transformIndexHtml: { order: "pre", handler: (html) => html.replace("/src/Program.ts", "/src/RouterProgram.ts") },
};

export default defineConfig(({ mode }) => ({
  // TSAZOR_OPTIMIZE=0 builds the reference without the compiler's optimizations (static markup blocks F1a, stable
  // handlers H1, …), for A/B measurements.
  plugins: [tsazor({ optimize: process.env.TSAZOR_OPTIMIZE !== "0" }), ...(mode === "router" ? [routerEntry] : [])],
  build: { outDir: mode === "router" ? "dist-router" : "dist" },
}));
