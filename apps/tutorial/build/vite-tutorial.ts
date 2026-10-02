/**
 * Vite plugin of the tutorial app:
 *
 * - `virtual:tutorial-content` — the content tree (build/content.ts), lesson
 *   text rendered to HTML at build time; reloads when content/ changes.
 * - `virtual:tutorial-bundles` — prebuilt ES-module bundles of
 *   `@tsazor/runtime` and `@tsazor/components` (components with the runtime
 *   external), as strings: the preview iframe turns them into blob URLs and
 *   maps the bare specifiers to them with an import map.
 * - `virtual:tutorial-types` — the type environment of the in-browser
 *   `tsazor check` (lib .d.ts + package declarations, build/type-env.ts);
 *   loaded lazily by the compile worker.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { loadContent } from "./content.js";
import { loadTypeEnvironment } from "./type-env.js";

const CONTENT_ID = "virtual:tutorial-content";
const BUNDLES_ID = "virtual:tutorial-bundles";
const TYPES_ID = "virtual:tutorial-types";
const RESOLVED_CONTENT = `\0${CONTENT_ID}`;
const RESOLVED_BUNDLES = `\0${BUNDLES_ID}`;
const RESOLVED_TYPES = `\0${TYPES_ID}`;

export async function bundlePackages(fromDir: string): Promise<{ runtime: string; components: string }> {
  const require = createRequire(path.join(fromDir, "package.json"));
  const bundle = async (entry: string, external: string[]): Promise<string> => {
    const result = await build({
      entryPoints: [require.resolve(entry)],
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      minify: true,
      write: false,
      external,
      // Keep class names: the runtime and error messages use them.
      keepNames: true,
      legalComments: "none",
    });
    return result.outputFiles[0]!.text;
  };
  const [runtime, components] = await Promise.all([
    bundle("@tsazor/runtime", []),
    bundle("@tsazor/components", ["@tsazor/runtime"]),
  ]);
  return { runtime, components };
}

export function tutorialPlugin(options: { root: string }): Plugin {
  const contentDir = path.join(options.root, "content");
  let bundles: Promise<{ runtime: string; components: string }> | undefined;
  return {
    name: "tsazor-tutorial",
    resolveId(id) {
      if (id === CONTENT_ID) return RESOLVED_CONTENT;
      if (id === BUNDLES_ID) return RESOLVED_BUNDLES;
      if (id === TYPES_ID) return RESOLVED_TYPES;
      return null;
    },
    async load(id) {
      if (id === RESOLVED_CONTENT) {
        // (Watched by configureServer below — addWatchFile on a directory
        // would turn into an import in dev.)
        return `export default ${JSON.stringify(loadContent(contentDir))};`;
      }
      if (id === RESOLVED_BUNDLES) {
        bundles ??= bundlePackages(options.root);
        const { runtime, components } = await bundles;
        return `export const runtime = ${JSON.stringify(runtime)};\nexport const components = ${JSON.stringify(components)};`;
      }
      if (id === RESOLVED_TYPES) {
        return `export default ${JSON.stringify(loadTypeEnvironment(options.root))};`;
      }
      return null;
    },
    configureServer(server: ViteDevServer) {
      // Lets scripts/verify.mjs tell whether a server on its port serves this checkout.
      server.middlewares.use("/__tutorial-root", (_request, response) => response.end(path.resolve(options.root)));
      server.watcher.add(contentDir);
      const reload = (file: string): void => {
        if (!path.resolve(file).startsWith(contentDir)) return;
        const module = server.moduleGraph.getModuleById(RESOLVED_CONTENT);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
    },
  };
}
