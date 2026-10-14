import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({
  // TSAZOR_OPTIMIZE=0 builds the reference without the compiler's optimizations (static markup blocks F1a, stable
  // handlers H1, …), for A/B measurements.
  plugins: [tsazor({ optimize: process.env.TSAZOR_OPTIMIZE !== "0" })],
});
