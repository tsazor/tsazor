import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

/**
 * One set of pages, two skins. The sources say `@using @tsazor/bootstrap`; the
 * fluent build points that package at @tsazor/fluent — in an app of your own,
 * switching the skin is exactly that one line (and the stylesheet).
 */
export default defineConfig(({ mode }) => {
  const skin = mode === "fluent" ? "fluent" : "bootstrap";
  return {
    plugins: [tsazor()],
    resolve: {
      alias: skin === "fluent" ? [{ find: /^@tsazor\/bootstrap$/, replacement: "@tsazor/fluent" }] : [],
    },
    define: {
      __SKIN__: JSON.stringify(skin),
      __OTHER_SKIN_URL__: JSON.stringify(process.env.OTHER_SKIN_URL ?? (skin === "fluent" ? "http://localhost:5323" : "http://localhost:5324")),
    },
  };
});
