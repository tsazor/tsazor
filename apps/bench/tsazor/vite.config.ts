import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({
  // TSAZOR_STATIC_MARKUP=0 builds the F1a reference (element frames only) for A/B measurements.
  plugins: [tsazor({ staticMarkup: process.env.TSAZOR_STATIC_MARKUP !== "0" })],
});
