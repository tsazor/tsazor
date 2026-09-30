import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

// The API (api/, ASP.NET Core + Sleipnir) runs on :5310. Its endpoints are
// same-origin through this proxy; CORS headers are only a fallback for
// direct calls without the proxy.
export default defineConfig({
  publicDir: "wwwroot",
  plugins: [tsazor()],
  server: {
    port: 5311,
    strictPort: true,
    proxy: {
      // REST calls (/api/sleipnir/json) and SSE events
      // (/api/sleipnir/events/...) share this prefix.
      "/api/sleipnir": { target: "http://localhost:5310", changeOrigin: true },
      "/sleipnirws": { target: "http://localhost:5310", ws: true },
    },
  },
});