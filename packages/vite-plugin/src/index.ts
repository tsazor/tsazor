import { existsSync } from "node:fs";
import path from "node:path";
import type { TszDiagnostic } from "@tsazor/compiler";
import type { Plugin, ViteDevServer } from "vite";
import { generateRoutesModule, scanRoutes, scanTsazorModules } from "./routes.js";
import { processScopedCss, scopeHashFor } from "./scoped-css.js";
import { transformTsazor } from "./transform.js";

export { transformTsazor, type TransformTsazorOptions, type TransformTsazorResult } from "./transform.js";
export { formatCheckDiagnostic, runBuildCheck } from "./check-hook.js";

const ROUTES_MODULE_ID = "virtual:tsazor-routes";
const RESOLVED_ROUTES_MODULE_ID = "\0virtual:tsazor-routes";

export interface TsazorPluginOptions {
  /** Project root; defaults to the Vite config root. */
  root?: string;
  /** Runs `tsazor check` over the build root at build end (2.4): compiler
   *  diagnostics plus the typed shadow checks; errors fail the build. */
  check?: boolean;
}

export function tsazor(options: TsazorPluginOptions = {}): Plugin {
  let projectRoot = options.root ?? process.cwd();

  return {
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
      // Eager compile: dev transforms are lazy, so @code errors would only
      // surface when the browser requests the module. Warm every .tsazor at
      // startup — vite logs pre-transform errors to the terminal immediately.
      void warmupTsazorModules(server, projectRoot);
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
      return generateRoutesModule(projectRoot, routes);
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

      if (path.basename(filePath) === "_Imports.tsazor") {
        // _Imports.tsazor contributes directives only; it is never a component.
        return { code: "export default null;\n", map: null };
      }
      const result = await transformTsazor(code, filePath, projectRoot);
      reportImportsDiagnostics(result.importsDiagnostics);
      reportDiagnostics(result.diagnostics, filePath);
      return { code: result.code, map: result.map };
    },
  };
}

function stripQuery(id: string): string {
  const query = id.indexOf("?");
  return query >= 0 ? id.slice(0, query) : id;
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