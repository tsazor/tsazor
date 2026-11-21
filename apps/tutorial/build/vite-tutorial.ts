/**
 * Vite plugin of the tutorial app:
 *
 * - `virtual:tutorial-content` — the content tree (build/content.ts), lesson
 *   text rendered to HTML at build time; reloads when content/ changes.
 * - `virtual:tutorial-bundles` — prebuilt ES-module bundles of
 *   `@tsazor/runtime`, `@tsazor/bootstrap` and `@tsazor/dotnet` (the latter
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
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { loadSite, type Site } from "./site.js";
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
  /** @tsazor/runtime and @tsazor/runtime/internal in one module (@tsazor/testing imports both: one renderer). */
  runtime: string;
  components: string;
  dotnet: string;
  /** @tsazor/testing (the runtime external). */
  testing: string;
  /** The preview's test runner (src/preview/mini-test.ts), imported as "vitest". */
  vitest: string;
  /** F4/F5: @tsazor/runtime/transition, /animate and /easing (self-contained). */
  transition: string;
  animate: string;
  easing: string;
  /** @tsazor/worker (self-contained). */
  worker: string;
  /** @tsazor/worker as CommonJS: lesson workers run as classic workers in the preview. */
  workerCjs: string;
  /** Bootstrap's stylesheet: the preview adds it for lessons that use @tsazor/bootstrap. */
  bootstrapCss: string;
}

export async function bundlePackages(fromDir: string): Promise<PackageBundles> {
  const require = createRequire(path.join(fromDir, "package.json"));
  const bundle = async (entry: string | { readonly contents: string }, external: string[], format: "esm" | "cjs" = "esm"): Promise<string> => {
    const result = await build({
      ...(typeof entry === "string"
        ? { entryPoints: [path.isAbsolute(entry) ? entry : require.resolve(entry)] }
        : { stdin: { contents: entry.contents, resolveDir: fromDir, loader: "js" as const } }),
      bundle: true,
      format,
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
  const [runtime, components, dotnet, testing, vitest, transition, animate, easing, worker, workerCjs] = await Promise.all([
    // Their exports don't overlap: one module serves both specifiers.
    bundle({ contents: 'export * from "@tsazor/runtime";\nexport * from "@tsazor/runtime/internal";\n' }, []),
    bundle("@tsazor/bootstrap", ["@tsazor/runtime"]),
    bundle("@tsazor/dotnet", ["@tsazor/runtime"]),
    bundle("@tsazor/testing", ["@tsazor/runtime", "@tsazor/runtime/internal"]),
    bundle(path.join(fromDir, "src", "preview", "mini-test.ts"), []),
    bundle("@tsazor/runtime/transition", ["@tsazor/runtime"]),
    bundle("@tsazor/runtime/animate", ["@tsazor/runtime"]),
    bundle("@tsazor/runtime/easing", ["@tsazor/runtime"]),
    bundle("@tsazor/worker", []),
    bundle("@tsazor/worker", [], "cjs"),
  ]);
  const bootstrapCss = readFileSync(require.resolve("bootstrap/dist/css/bootstrap.min.css"), "utf8");
  return { runtime, components, dotnet, testing, vitest, transition, animate, easing, worker, workerCjs, bootstrapCss };
}

export function tutorialPlugin(options: { root: string }): Plugin {
  const contentDir = path.join(options.root, "content");
  const repoRoot = path.resolve(options.root, "..", "..");
  const languageReference = path.join(repoRoot, "docs", "language-reference.md");
  let bundles: Promise<PackageBundles> | undefined;
  // Content and reference link to each other: built together, rebuilt on a change of either.
  let site: Site | undefined;
  const currentSite = (): Site => (site ??= loadSite(options.root));
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
        return `export default ${JSON.stringify(currentSite().content)};`;
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
        return `export default ${JSON.stringify(currentSite().reference)};`;
      }
      return null;
    },
    configureServer(server: ViteDevServer) {
      // Lets scripts/verify.mjs tell whether a server on its port serves this checkout.
      server.middlewares.use("/__tutorial-root", (_request, response) => response.end(path.resolve(options.root)));
      server.watcher.add([contentDir, languageReference]);
      const reload = (file: string): void => {
        const changed = path.resolve(file);
        if (changed !== languageReference && !changed.startsWith(contentDir)) return;
        site = undefined;
        for (const id of [RESOLVED_CONTENT, RESOLVED_REFERENCE]) {
          const module = server.moduleGraph.getModuleById(id);
          if (module) server.moduleGraph.invalidateModule(module);
        }
        server.ws.send({ type: "full-reload" });
      };
      server.watcher.on("change", reload);
      server.watcher.on("add", reload);
      server.watcher.on("unlink", reload);
    },
  };
}
