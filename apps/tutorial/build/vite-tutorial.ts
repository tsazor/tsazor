/**
 * Vite plugin of the tutorial app:
 *
 * - `virtual:tutorial-content` — the content tree (build/content.ts), lesson
 *   text rendered to HTML at build time; reloads when content/ changes.
 * - `virtual:tutorial-bundles` — prebuilt ES-module bundles of
 *   `@tsazor/runtime`, `@tsazor/components` and `@tsazor/dotnet` (the latter
 *   two with the runtime external), as strings: the preview iframe turns them into blob URLs and
 *   maps the bare specifiers to them with an import map.
 * - `virtual:tutorial-types` — the type environment of the in-browser
 *   `tsazor check` (lib .d.ts + package declarations, build/type-env.ts);
 *   loaded lazily by the compile worker.
 * - `virtual:tutorial-reference` — the reference (build/reference.ts): the
 *   language reference and the component manifests; reloads when
 *   docs/language-reference.md changes.
 */
import { build } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { loadContent } from "./content.js";
import { loadReference } from "./reference.js";
import { loadTypeEnvironment } from "./type-env.js";

const CONTENT_ID = "virtual:tutorial-content";
const BUNDLES_ID = "virtual:tutorial-bundles";
const TYPES_ID = "virtual:tutorial-types";
const RESOLVED_CONTENT = `\0${CONTENT_ID}`;
const RESOLVED_BUNDLES = `\0${BUNDLES_ID}`;
const RESOLVED_TYPES = `\0${TYPES_ID}`;
const REFERENCE_ID = "virtual:tutorial-reference";
const RESOLVED_REFERENCE = `\0${REFERENCE_ID}`;

export interface PackageBundles {
  runtime: string;
  components: string;
  dotnet: string;
  /** @tsazor/testing (the runtime external). */
  testing: string;
  /** The preview's test runner (src/preview/mini-test.ts), imported as "vitest". */
  vitest: string;
}

export async function bundlePackages(fromDir: string): Promise<PackageBundles> {
  const require = createRequire(path.join(fromDir, "package.json"));
  const bundle = async (entry: string, external: string[]): Promise<string> => {
    const result = await build({
      entryPoints: [path.isAbsolute(entry) ? entry : require.resolve(entry)],
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
  const [runtime, components, dotnet, testing, vitest] = await Promise.all([
    bundle("@tsazor/runtime", []),
    bundle("@tsazor/components", ["@tsazor/runtime"]),
    bundle("@tsazor/dotnet", ["@tsazor/runtime"]),
    bundle("@tsazor/testing", ["@tsazor/runtime"]),
    bundle(path.join(fromDir, "src", "preview", "mini-test.ts"), []),
  ]);
  return { runtime, components, dotnet, testing, vitest };
}

export function tutorialPlugin(options: { root: string }): Plugin {
  const contentDir = path.join(options.root, "content");
  const repoRoot = path.resolve(options.root, "..", "..");
  const languageReference = path.join(repoRoot, "docs", "language-reference.md");
  let bundles: Promise<PackageBundles> | undefined;
  return {
    name: "tsazor-tutorial",
    resolveId(id) {
      if (id === CONTENT_ID) return RESOLVED_CONTENT;
      if (id === BUNDLES_ID) return RESOLVED_BUNDLES;
      if (id === TYPES_ID) return RESOLVED_TYPES;
      if (id === REFERENCE_ID) return RESOLVED_REFERENCE;
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
        return Object.entries(await bundles)
          .map(([name, code]) => `export const ${name} = ${JSON.stringify(code)};`)
          .join("\n");
      }
      if (id === RESOLVED_TYPES) {
        return `export default ${JSON.stringify(loadTypeEnvironment(options.root))};`;
      }
      if (id === RESOLVED_REFERENCE) {
        return `export default ${JSON.stringify(loadReference(repoRoot))};`;
      }
      return null;
    },
    configureServer(server: ViteDevServer) {
      // Lets scripts/verify.mjs tell whether a server on its port serves this checkout.
      server.middlewares.use("/__tutorial-root", (_request, response) => response.end(path.resolve(options.root)));
      server.watcher.add([contentDir, languageReference]);
      const reload = (file: string): void => {
        const changed = path.resolve(file);
        const id = changed === languageReference ? RESOLVED_REFERENCE : changed.startsWith(contentDir) ? RESOLVED_CONTENT : undefined;
        if (!id) return;
        const module = server.moduleGraph.getModuleById(id);
        if (module) server.moduleGraph.invalidateModule(module);
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
    },
  };
}
