import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

// The Tsazor pages of the migration sample. The gateway serves this build: index.html for the
// migrated routes, the assets under /tsazor/ (so they never collide with the Blazor app's paths).
// `pnpm dev` runs the pages on :5412 against the Blazor app (:5411) for quick iteration; the real
// setup is the gateway (:5410).
export default defineConfig({
  base: "/tsazor/",
  plugins: [tsazor()],
  server: {
    port: 5412,
    strictPort: true,
    proxy: {
      "^/(api|auth|account|app\.css)": "http://localhost:5411",
    },
  },
});
