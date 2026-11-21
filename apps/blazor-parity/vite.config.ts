import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

/**
 * One app, built once per DataGrid skin (as apps/skins does). Blazor's QuickGrid pages (src/Pages/QuickGrid/)
 * run against the DataGrid of @tsazor/fluent and of @tsazor/bootstrap: they say `@using @tsazor/fluent`, and
 * `--mode bootstrap` points that package at @tsazor/bootstrap. Each build goes to dist/<skin>/.
 *
 * The QuickGrid pages are lazy routes: each loads as its own chunk, with its skin's stylesheet. So a page
 * outside QuickGrid/ never loads a skin's CSS (Bootstrap's reboot would restyle the Virtualization pages), and
 * those pages are the same in both builds.
 */
export default defineConfig(({ mode }) => {
  const skin = mode === "bootstrap" ? "bootstrap" : "fluent";
  return {
    plugins: [tsazor({ lazyRoutes: ["src/Pages/QuickGrid/**"] })],
    resolve: {
      alias: skin === "bootstrap" ? [{ find: /^@tsazor\/fluent$/, replacement: "@tsazor/bootstrap" }] : [],
    },
    define: {
      __SKIN__: JSON.stringify(skin),
    },
    build: {
      outDir: `dist/${skin}`,
    },
  };
});
