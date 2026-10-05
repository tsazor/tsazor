import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

// The gallery is self-contained: no backend, no proxy. Verify scripts assume
// this strict port.
export default defineConfig({
  publicDir: "wwwroot",
  // E5: the admin dashboard loads on the first visit (its own chunks).
  plugins: [tsazor({ lazyRoutes: ["src/Pages/DashboardHome.tsazor", "src/Pages/OrdersPage.tsazor", "src/Pages/SettingsPage.tsazor"] })],
  server: {
    port: 5321,
    strictPort: true,
  },
});