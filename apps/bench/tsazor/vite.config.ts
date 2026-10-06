import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

export default defineConfig({
  // TSAZOR_STATIC_MARKUP=0 builds the F1a reference (element frames only), TSAZOR_RENDER_HINTS=0 the
  // H1 reference (a handler closure per render), TSAZOR_OPTIMIZE=0 both — for A/B measurements.
  plugins: [tsazor({
    staticMarkup: process.env.TSAZOR_STATIC_MARKUP !== "0",
    renderHints: process.env.TSAZOR_RENDER_HINTS !== "0",
    optimize: process.env.TSAZOR_OPTIMIZE !== "0",
  })],
});
