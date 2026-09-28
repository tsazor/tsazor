import { compile, type ResolvedComponent, type ResolvedType } from "@tasor/compiler";
import { transformSync } from "esbuild";
import path from "node:path";
import type { Plugin } from "vite";
import { hmrAppendix } from "./hmr";
import { generateRoutesModule, scanRoutes } from "./routes";
import { chainSourceMaps } from "./sourcemap";
import { collectCodeImports, collectImports, createFileContext } from "@tasor/workspace";

const ROUTES_MODULE_ID = "virtual:tasor-routes";
const RESOLVED_ROUTES_MODULE_ID = "\0virtual:tasor-routes";

export interface TasorPluginOptions {
  /** Project root; defaults to the Vite config root. */
  root?: string;
}

export function tasor(options: TasorPluginOptions = {}): Plugin {
  let projectRoot = options.root ?? process.cwd();

  return {
    name: "tasor",
    enforce: "pre",

    configResolved(config) {
      projectRoot = path.resolve(options.root ?? config.root);
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
      if (!filePath.endsWith(".tazor") || filePath.includes("node_modules") || filePath.startsWith("\0")) {
        return null;
      }

      const chain = await collectImports(path.dirname(filePath), projectRoot);
      if (path.basename(filePath) === "_Imports.tazor") {
        // _Imports.tazor contributes directives only; it is never a component.
        return { code: "export default null;\n", map: null };
      }
      const context = createFileContext(filePath, chain);

      // Pass 1 compiles without extra imports so we can see which bindings
      // the compiler emitted itself; the scan then adds import lines for
      // identifiers used inside verbatim @code blocks (pass 2).
      const first = compile(code, {
        className: context.className,
        fileName: filePath,
        resolveComponent: (tagName, usings): ResolvedComponent | null => context.resolveComponent(tagName, usings),
        resolveType: (name, usings): ResolvedType | null => context.resolveType(name, usings),
        generateSourceMap: false,
      });
      const extraImports = collectCodeImports(code, first.code, context);

      const compiled = compile(code, {
        className: context.className,
        fileName: filePath,
        resolveComponent: (tagName, usings): ResolvedComponent | null => context.resolveComponent(tagName, usings),
        resolveType: (name, usings): ResolvedType | null => context.resolveType(name, usings),
        imports: extraImports,
        generateSourceMap: true,
      });
      reportDiagnostics(first.diagnostics, filePath);

      const transpiled = transformSync(compiled.code, {
        loader: "ts",
        sourcemap: true,
        sourcefile: `${filePath}.ts`,
        tsconfigRaw: {
          compilerOptions: {
            experimentalDecorators: true,
            useDefineForClassFields: false,
            target: "es2022",
          },
        },
      });

      const map = chainSourceMaps(compiled.map!, transpiled.map!, filePath, `${path.basename(filePath)} (tasor)`);
      const js = transpiled.code + hmrAppendix(context.className);
      return { code: js, map };
    },
  };
}

function stripQuery(id: string): string {
  const query = id.indexOf("?");
  return query >= 0 ? id.slice(0, query) : id;
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
        `[tasor] warning ${diagnostic.code} (${filePath}:${diagnostic.pos.line}:${diagnostic.pos.column}): ${diagnostic.message}`,
      );
    }
  }
  const errors = diagnostics.all.filter((diagnostic) => diagnostic.severity === "error");
  if (errors.length === 0) return;
  const details = errors
    .map((diagnostic) => `  ${diagnostic.code} (${diagnostic.pos.line}:${diagnostic.pos.column}): ${diagnostic.message}`)
    .join("\n");
  const error = new Error(`[tasor] compile errors in ${filePath}\n${details}`);
  (error as unknown as { id: string; loc: { file: string; line: number; column: number } }).id = filePath;
  (error as unknown as { loc: { file: string; line: number; column: number } }).loc = {
    file: filePath,
    line: errors[0]!.pos.line,
    column: errors[0]!.pos.column,
  };
  throw error;
}

export default tasor;