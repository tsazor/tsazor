import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

// The gallery is self-contained: no backend, no proxy. Verify scripts assume
// this strict port.
export default defineConfig({
  publicDir: "wwwroot",
  plugins: [tsazor()],
  server: {
    port: 5321,
    strictPort: true,
  },
});