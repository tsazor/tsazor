import { defineConfig } from "vite";
import { tasor } from "@tasor/vite-plugin";

// The backend (server/server.mjs) runs on :5300; all its endpoints are
// same-origin through this proxy — like the workshop's configured HttpClient.
const API_PREFIX = "^/(specials|toppings|orders|notifications|auth)";

export default defineConfig({
  publicDir: "wwwroot",
  plugins: [tasor()],
  server: {
    port: 5301,
    strictPort: true,
    proxy: {
      [API_PREFIX]: "http://localhost:5300",
    },
  },
});