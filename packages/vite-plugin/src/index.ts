import { existsSync } from "node:fs";
import path from "node:path";
import { compile, type TszDiagnostic } from "@tsazor/compiler";
import { createFilter, type EnvironmentModuleNode, type ModuleNode, type Plugin, type ViteDevServer } from "vite";
import { isImportsFile, TransformRegistry } from "./invalidate.js";
import { tsazorHotUpdate } from "./hot-update.js";
import { generateRoutesModule, listTsazorFilesUnder, scanRoutes, scanRootOf, scanTsazorModules } from "./routes.js";
import { processScopedCss, scopeHashFor } from "./scoped-css.js";
import { transformTsazor } from "./transform.js";

export { transformTsazor, type TransformTsazorOptions, type TransformTsazorResult } from "./transform.js";
export { formatCheckDiagnostic, runBuildCheck } from "./check-hook.js";
export { isImportsFile, normalizeFileKey, planInvalidation, TransformRegistry, type InvalidationPlan } from "./invalidate.js";
export { tsazorHotUpdate } from "./hot-update.js";

const ROUTES_MODULE_ID = "virtual:tsazor-routes";
const RESOLVED_ROUTES_MODULE_ID = "\0virtual:tsazor-routes";

/** Options of the `tsazor()` Vite plugin. */
export interface TsazorPluginOptions {
  /** Project root; defaults to the Vite config root. */
  root?: string;
  /** Runs `tsazor check` (2.4): compiler diagnostics plus the typed shadow
   *  checks. A build runs it at the end and fails on errors. The dev server
   *  runs it in the background (at start and after each change) and prints
   *  the findings without blocking anything (S3). */
  check?: boolean;
  /** F1a: static subtrees as one markup block each (default true). `false` emits
   *  element frames throughout — an escape hatch for one release (design-static-markup.md D-S5). */
  staticMarkup?: boolean;
  /** H1: event-handler lambdas become stable handlers — re-rendering an
   *  unchanged row swaps no listener (default true). `false` emits a new
   *  closure per render, as Razor does (design-render-hints.md D-R4). */
  renderHints?: boolean;
  /** Every invisible compiler optimization (default true). `false` turns
   *  `staticMarkup` and `renderHints` (and later ones) off — the generated
   *  code is then what Razor would generate: a diagnostic and emergency
   *  switch (A/B measurements, a suspected optimizer bug), not a recommended mode.
   *  It also caches no child content (H4), so section content is rebuilt on
   *  every render of its component. */
  optimize?: boolean;
  /**
   * E5: pages loaded on the first navigation to them — `true` for every
   * page, or globs relative to the project root (`["src/Pages/Admin/**"]`).
   * Each lazy page becomes its own chunk (its layout loads with it); the
   * router shows `<Navigating>` meanwhile. Default: every page is eager.
   */
  lazyRoutes?: boolean | string[];
}

/**
 * The Tsazor Vite plugin (also the default export): compiles `.tsazor` files
 * to JS modules with sourcemaps and HMR, scopes `.tsazor.css` sidecars,
 * serves the `virtual:tsazor-routes` manifest of the app's `@page` routes,
 * and lets esbuild lower the standard decorators of the app's `.ts` files.
 * Compile errors fail the module (Vite's error overlay in dev); with
 * `check: true` the type checks run as well.
 *
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import tsazor from "@tsazor/vite-plugin";
 *
 * export default defineConfig({ plugins: [tsazor()] });
 * ```
 */
export function tsazor(options: TsazorPluginOptions = {}): Plugin {
  let projectRoot = options.root ?? process.cwd();
  /** 4.1: per-file dependency edges recorded by transform, consumed by the hot-update handler. */
  const registry = new TransformRegistry();

  const plugin: Plugin = {
    name: "tsazor",
    enforce: "pre",

    config(userConfig) {
      // The app's own .ts files (code-behind, hand-written components) use
      // the runtime's standard decorators too. Vite's dev transform targets
      // esnext, which leaves decorators as written — no engine runs them
      // natively yet, so have esbuild lower them (dev and build).
      if (userConfig.esbuild === false) return;
      return { esbuild: { supported: { decorators: false } } };
    },

    configResolved(config) {
      projectRoot = path.resolve(options.root ?? config.root);
    },

    configureServer(server) {
      // S3: type errors are reported in the background, never as a failed module.
      if (options.check === true) {
        void import("./dev-check.js").then(({ startDevCheck }) =>
          startDevCheck(server.watcher, { root: projectRoot, log: (line) => server.config.logger.warn(`[tsazor] ${line}`) }),
        );
      }
      // Eager compile: dev transforms are lazy, so @code errors would only
      // surface when the browser requests the module. Warm every .tsazor at
      // startup — vite logs pre-transform errors to the terminal immediately.
      void warmupTsazorModules(server, projectRoot);
      // 4.1: watch every .tsazor (plus sidecars) explicitly so create/delete
      // events reach the hot-update handler even before the file is imported.
      void (async () => {
        try {
          server.watcher.add(await listTsazorFilesUnder(scanRootOf(projectRoot)));
        } catch {
          // The default watch set covers the project; explicit adds are best-effort.
        }
      })();
    },

    // Vite ≥ 6 prefers hotUpdate; Vite 5 only knows handleHotUpdate (the
    // legacy path below). One shared handler, both signatures.
    async hotUpdate(options): Promise<EnvironmentModuleNode[] | undefined> {
      if ((this.environment?.name ?? "client") !== "client") return undefined;
      return tsazorHotUpdate(
        { event: options.type, file: options.file, read: options.read, server: options.server, registry, projectRoot },
        options.modules,
      ) as Promise<EnvironmentModuleNode[] | undefined>;
    },

    async handleHotUpdate(ctx): Promise<ModuleNode[] | undefined> {
      // Vite 5's hook has no event type; add/unlink of watched files surface
      // as plain updates there (Vite 7 users get the proper hotUpdate path).
      return tsazorHotUpdate(
        { event: "update", file: ctx.file, read: ctx.read, server: ctx.server, registry, projectRoot },
        ctx.modules,
      ) as Promise<ModuleNode[] | undefined>;
    },

    async closeBundle() {
      // 2.4: the optional gate — build end (after write) so the produced
      // output exists; the check runs lazily (@tsazor/lsp is loaded only on
      // builds that opt in).
      if (options.check !== true) return;
      const { runBuildCheck } = await import("./check-hook.js");
      const diagnostics = await runBuildCheck(projectRoot, (line) =>
        // eslint-disable-next-line no-console
        console.warn(`[tsazor] ${line}`),
      );
      const errors = diagnostics.filter((d) => d.severity === "error").length;
      if (errors > 0) this.error(`tsazor check failed: ${errors} error(s)`);
    },

    resolveId(id) {
      if (id === ROUTES_MODULE_ID) return RESOLVED_ROUTES_MODULE_ID;
      return null;
    },

    async load(id) {
      if (id !== RESOLVED_ROUTES_MODULE_ID) return null;
      const routes = await scanRoutes(projectRoot);
      return generateRoutesModule(projectRoot, routes, lazyRouteFilter(options.lazyRoutes, projectRoot));
    },

    async transform(code, id) {
      const filePath = stripQuery(id);
      if (filePath.includes("node_modules") || filePath.startsWith("\0")) {
        return null;
      }

      // Scoped CSS sidecar (Blazor mechanism): rewrite selectors to the scope
      // attribute of the owning .tsazor file, then hand back to Vite's CSS
      // pipeline (which handles dev injection, extraction and HMR).
      if (filePath.endsWith(".tsazor.css")) {
        const owner = filePath.slice(0, -".css".length);
        if (!existsSync(owner)) return null;
        const css = await processScopedCss(code, scopeHashFor(projectRoot, owner), filePath);
        return { code: css, map: null };
      }

      if (!filePath.endsWith(".tsazor")) {
        return null;
      }

      if (isImportsFile(filePath)) {
        // _Imports.tsazor contributes directives only; it is never a component.
        // Its @layout feeds route-manifest invalidation (4.1) — recording is
        // best-effort: the file keeps compiling to an empty module on errors.
        try {
          const compiled = compile(code, { className: "_Imports", fileName: filePath, generateSourceMap: false });
          registry.recordDynamic(filePath, compiled.metadata, true);
        } catch {
          // The importing modules throw the real diagnostics; nothing to record.
        }
        return { code: "export default null;\n", map: null };
      }
      const result = await transformTsazor(code, filePath, projectRoot, {
        ...(options.staticMarkup === false ? { staticMarkup: false } : {}),
        ...(options.renderHints === false ? { renderHints: false } : {}),
        ...(options.optimize === false ? { optimize: false } : {}),
      });
      registry.recordTransform(filePath, result.metadata, result.componentFiles);
      reportImportsDiagnostics(result.importsDiagnostics);
      reportDiagnostics(result.diagnostics, filePath);
      return { code: result.code, map: result.map };
    },
  };

  function stripQuery(id: string): string {
    const query = id.indexOf("?");
    return query >= 0 ? id.slice(0, query) : id;
  }

  return plugin;
}

async function warmupTsazorModules(server: ViteDevServer, projectRoot: string): Promise<void> {
  // vite <5.1 has no warmupRequest — fall back to on-demand behavior.
  if (typeof server.warmupRequest !== "function") return;
  for (const url of await scanTsazorModules(projectRoot)) {
    // warmupRequest logs pre-transform errors itself; it never rejects.
    await server.warmupRequest(url);
  }
}

/** _Imports warnings already printed (every file in the folder shares them). */
const reportedImportsWarnings = new Set<string>();

/**
 * _Imports.tsazor is never transformed itself, so its diagnostics surface
 * through the files that inherit it: errors (e.g. an invalid @import) fail
 * the importing module, warnings are printed once per location.
 */
function reportImportsDiagnostics(entries: ReadonlyArray<{ file: string; diagnostic: TszDiagnostic }>): void {
  const errors = entries.filter((entry) => entry.diagnostic.severity === "error");
  for (const { file, diagnostic } of entries) {
    if (diagnostic.severity !== "warning") continue;
    const key = `${file}:${diagnostic.pos.line}:${diagnostic.pos.column}:${diagnostic.message}`;
    if (reportedImportsWarnings.has(key)) continue;
    reportedImportsWarnings.add(key);
    // eslint-disable-next-line no-console
    console.warn(`[tsazor] warning ${diagnostic.code} (${file}:${diagnostic.pos.line}:${diagnostic.pos.column}): ${diagnostic.message}`);
  }
  if (errors.length === 0) return;
  const first = errors[0]!;
  const details = errors
    .map(({ file, diagnostic }) => `  ${diagnostic.code} (${file}:${diagnostic.pos.line}:${diagnostic.pos.column}): ${diagnostic.message}`)
    .join("\n");
  const error = new Error(`[tsazor] compile errors in ${first.file}\n${details}`);
  (error as unknown as { id: string }).id = first.file;
  (error as unknown as { loc: { file: string; line: number; column: number } }).loc = {
    file: first.file,
    line: first.diagnostic.pos.line,
    column: first.diagnostic.pos.column,
  };
  throw error;
}

/**
 * The compiler never fails silently: errors are thrown as a located error
 * (Vite's dev-server overlay picks it up), warnings go to the console.
 */
function reportDiagnostics(diagnostics: { all: readonly { code: string; message: string; severity: string; pos: { line: number; column: number } }[] }, filePath: string): void {
  for (const diagnostic of diagnostics.all) {
    if (diagnostic.severity === "warning") {
      // eslint-disable-next-line no-console
      console.warn(
        `[tsazor] warning ${diagnostic.code} (${filePath}:${diagnostic.pos.line}:${diagnostic.pos.column}): ${diagnostic.message}`,
      );
    }
  }
  const errors = diagnostics.all.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length === 0) return;
  const details = errors
    .map((diagnostic) => `  ${diagnostic.code} (${diagnostic.pos.line}:${diagnostic.pos.column}): ${diagnostic.message}`)
    .join("\n");
  const error = new Error(`[tsazor] compile errors in ${filePath}\n${details}`);
  (error as unknown as { id: string; loc: { file: string; line: number; column: number } }).id = filePath;
  (error as unknown as { loc: { file: string; line: number; column: number } }).loc = {
    file: filePath,
    line: errors[0]!.pos.line,
    column: errors[0]!.pos.column,
  };
  throw error;
}

export default tsazor;
/** The `lazyRoutes` option as a predicate over a page's absolute path. */
export function lazyRouteFilter(lazyRoutes: boolean | string[] | undefined, root: string): (componentPath: string) => boolean {
  if (lazyRoutes === true) return () => true;
  if (!lazyRoutes || lazyRoutes.length === 0) return () => false;
  const filter = createFilter(lazyRoutes, null, { resolve: root });
  return (componentPath) => filter(componentPath);
}
