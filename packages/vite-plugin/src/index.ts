import { compile, type ResolvedComponent, type ResolvedType } from "@tasor/compiler";
import { transformSync } from "esbuild";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { hmrAppendix } from "./hmr";
import { generateRoutesModule, scanRoutes } from "./routes";
import { processScopedCss, scopeHashFor } from "./scoped-css";
import { chainSourceMaps } from "./sourcemap";
import { collectCodeImports, collectImports, createFileContext, RUNTIME_TYPES, RUNTIME_PACKAGE } from "@tasor/workspace";

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
      if (filePath.includes("node_modules") || filePath.startsWith("\0")) {
        return null;
      }

      // Scoped CSS sidecar (Blazor mechanism): rewrite selectors to the scope
      // attribute of the owning .tazor file, then hand back to Vite's CSS
      // pipeline (which handles dev injection, extraction and HMR).
      if (filePath.endsWith(".tazor.css")) {
        const owner = filePath.slice(0, -".css".length);
        if (!existsSync(owner)) return null;
        const css = await processScopedCss(code, scopeHashFor(projectRoot, owner), filePath);
        return { code: css, map: null };
      }

      if (!filePath.endsWith(".tazor")) {
        return null;
      }

      const chain = await collectImports(path.dirname(filePath), projectRoot);
      if (path.basename(filePath) === "_Imports.tazor") {
        // _Imports.tazor contributes directives only; it is never a component.
        return { code: "export default null;\n", map: null };
      }
      const context = createFileContext(filePath, chain);

      // Runtime enums/values referenced in markup (e.g. NavLinkMatch.All) are
      // imported by collectCodeImports — they must not be baked to this.*.
      const knownGlobals = new Set<string>();
      for (const match of code.matchAll(/\b[A-Z][A-Za-z0-9_$]*\b/g)) {
        if (RUNTIME_TYPES.has(match[0])) knownGlobals.add(match[0]);
      }

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

      // Code-behind: when a sibling X.tazor.ts exists (the compiled module's
      // own default import), the generated class extends its default export.
      // The .ts sidecar itself is compiled by Vite's normal TS pipeline.
      const codeBehindPath = `${filePath}.ts`;
      const codeBehindClass = existsSync(codeBehindPath) ? `${context.className}Base` : undefined;
      if (codeBehindClass) {
        extraImports.push(`import ${codeBehindClass} from "./${path.basename(codeBehindPath)}";`);
      }

      // Scoped CSS: when a sidecar exists, emit its import into the module
      // and let the compiler stamp the scope attribute on this file's markup.
      const sidecarPath = `${filePath}.css`;
      const sidecar = existsSync(sidecarPath);
      const scopeHash = sidecar ? scopeHashFor(projectRoot, filePath) : undefined;
      if (sidecar) {
        extraImports.push(`import "./${path.basename(sidecarPath)}";`);
      }

      const compiled = compile(code, {
        className: context.className,
        fileName: filePath,
        resolveComponent: (tagName, usings): ResolvedComponent | null => context.resolveComponent(tagName, usings),
        resolveType: (name, usings): ResolvedType | null => context.resolveType(name, usings),
        knownGlobals,
        imports: extraImports,
        codeBehindClass,
        scopeHash,
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