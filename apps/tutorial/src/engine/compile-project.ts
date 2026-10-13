/**
 * The tutorial's in-browser build: every project file → a browser-ready ES
 * module (or a stylesheet), plus located diagnostics. Pure — no DOM, no Node
 * APIs — so the Web Worker and the headless gate test run exactly this code.
 *
 *   X.tsazor      → @tsazor/compiler → TS → typescript.transpileModule → JS
 *   X.tsazor.ts   → code-behind (the generated class extends its default export)
 *   X.tsazor.css  → scoped CSS (scope attribute stamped by the compiler)
 *   X.ts          → transpileModule
 *   X.css         → global CSS
 *   Program.ts    → (optional) the app's start: createTsazorApp + services
 *
 * Relative import specifiers are rewritten to module ids (`$app/App.tsazor`),
 * which the preview maps to blob URLs through an import map; bare specifiers
 * (`@tsazor/runtime`) stay and are mapped to the prebuilt bundles.
 */
import { compile, type TszDiagnostic } from "@tsazor/compiler";
import ts from "typescript";
import { addMapping, GenMapping, toEncodedMap } from "@jridgewell/gen-mapping";
import { eachMapping, originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { basename, classNameForFile, createResolver, resolveModuleFile } from "./resolve.js";
import { scopeCss, scopeHashFor } from "./scoped-css.js";

import { MODULE_PREFIX, type CompiledModule, type Diagnostic, type Files, type ProjectBuild, type RouteRequest } from "./types.js";

export { MODULE_PREFIX, originalPosition, type CompiledModule, type Diagnostic, type Files, type ProjectBuild, type RouteRequest } from "./types.js";

export interface BuildOptions {
  /** Entry component file (default `App.tsazor`). */
  entry?: string;
  /** F1a static markup blocks (default on); `false` for the DOM-equality gate's reference build. */
  staticMarkup?: boolean;
  /** H1 render hints — stable event handlers (default on); `false` for the DOM-equality gate's reference build. */
  renderHints?: boolean;
}

const TRANSPILE_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  // Standard (TC39) decorators — `experimentalDecorators` stays off (getting-started.md).
  useDefineForClassFields: true,
  sourceMap: true,
  inlineSources: false,
  verbatimModuleSyntax: false,
  isolatedModules: true,
};

/** The app's start file, when a lesson has one (services are registered there). */
export const PROGRAM = "Program.ts";

export function moduleIdFor(file: string): string {
  return `${MODULE_PREFIX}${file}`;
}

export function buildProject(files: Files, options: BuildOptions = {}): ProjectBuild {
  const resolver = createResolver(files);
  const diagnostics: Diagnostic[] = [];
  const modules: Record<string, CompiledModule> = {};
  const cssParts: string[] = [];
  const routes: RouteRequest[] = [];
  const entry = options.entry ?? "App.tsazor";

  const paths = Object.keys(files).sort();
  for (const file of paths) {
    const source = files[file]!;
    if (file.endsWith(".tsazor.css")) {
      const owner = file.slice(0, -".css".length);
      cssParts.push(`/* ${file} */\n${scopeCss(source, scopeHashFor(owner))}`);
    } else if (file.endsWith(".css")) {
      cssParts.push(`/* ${file} */\n${source}`);
    } else if (file.endsWith(".tsazor")) {
      if (basename(file) === "_Imports.tsazor") {
        diagnoseImports(file, source, resolver, diagnostics);
        continue;
      }
      const built = buildComponent(files, file, resolver, diagnostics, routes, options);
      if (built) modules[built.id] = built;
    } else if (file.endsWith(".ts")) {
      const built = transpile(files, file, source, undefined, diagnostics);
      if (built) modules[built.id] = built;
    }
  }

  const result: ProjectBuild = { modules, css: cssParts.join("\n"), diagnostics, routes };
  if (modules[moduleIdFor(entry)]) result.entry = moduleIdFor(entry);
  if (modules[moduleIdFor(PROGRAM)]) result.program = moduleIdFor(PROGRAM);
  return result;
}

/**
 * `_Imports.tsazor` is directive-only: no module, but its mistakes (an
 * invalid `@import`, a `@using` folder that doesn't exist) are reported on
 * it — as @tsazor/workspace's `collectImports` does.
 */
function diagnoseImports(file: string, source: string, resolver: ReturnType<typeof createResolver>, diagnostics: Diagnostic[]): void {
  let compiled: ReturnType<typeof compile>;
  try {
    compiled = compile(source, { className: "_Imports", fileName: file, generateSourceMap: false, resolveUsing: resolver.optionsFor(file).resolveUsing });
  } catch (error) {
    diagnostics.push(internalError(file, error));
    return;
  }
  for (const diagnostic of compiled.diagnostics.all) diagnostics.push(fromCompiler(file, diagnostic));
}

function buildComponent(
  files: Files,
  file: string,
  resolver: ReturnType<typeof createResolver>,
  diagnostics: Diagnostic[],
  routes: RouteRequest[],
  options: Pick<BuildOptions, "staticMarkup" | "renderHints"> = {},
): CompiledModule | undefined {
  const className = classNameForFile(file);
  const extraImports: string[] = [];
  const codeBehindFile = `${file}.ts`;
  const hasCodeBehind = codeBehindFile in files;
  const codeBehindClass = hasCodeBehind ? `${className}Base` : undefined;
  if (codeBehindClass) extraImports.push(`import ${codeBehindClass} from "./${basename(codeBehindFile)}";`);
  const scopeHash = `${file}.css` in files ? scopeHashFor(file) : undefined;

  let compiled: ReturnType<typeof compile>;
  try {
    compiled = compile(files[file]!, {
      ...resolver.optionsFor(file),
      imports: extraImports,
      ...(codeBehindClass ? { codeBehindClass, codeBehindSource: files[codeBehindFile] } : {}),
      ...(scopeHash ? { scopeHash } : {}),
      ...(options.staticMarkup === false ? { staticMarkup: false } : {}),
      ...(options.renderHints === false ? { renderHints: false } : {}),
    });
  } catch (error) {
    diagnostics.push(internalError(file, error));
    return undefined;
  }
  for (const diagnostic of compiled.diagnostics.all) {
    diagnostics.push(fromCompiler(file, diagnostic));
  }
  if (compiled.diagnostics.hasErrors) return undefined;
  collectRoutes(files, file, resolver, compiled.metadata, routes);
  return transpile(files, file, compiled.code, compiled.map, diagnostics);
}

/**
 * The route manifest: one RouteRequest per @page template (the in-browser
 * counterpart of a real app's `virtual:tsazor-routes`, which the Vite plugin
 * scans from disk). A @layout resolves like a tag: the named file in the
 * page's folder or an enclosing one.
 */
function collectRoutes(
  files: Files,
  file: string,
  resolver: ReturnType<typeof createResolver>,
  metadata: ReturnType<typeof compile>["metadata"],
  routes: RouteRequest[],
): void {
  if (metadata.routeTemplates.length === 0) return;
  const options = resolver.optionsFor(file);
  let layout: string | undefined;
  if (metadata.layout) {
    const resolved = options.resolveComponent?.(metadata.layout, []) ?? null;
    layout = resolved ? resolveModuleFile(files, resolved.specifier, file) : undefined;
  }
  const authorize = metadata.authorize ? (metadata.authorizeData ?? {}) : undefined;
  for (const template of metadata.routeTemplates) {
    const request: RouteRequest = { template, module: moduleIdFor(file) };
    if (layout) request.layout = moduleIdFor(layout);
    if (authorize) request.authorize = authorize;
    routes.push(request);
  }
}

function transpile(files: Files, file: string, source: string, innerMap: string | undefined, diagnostics: Diagnostic[]): CompiledModule | undefined {
  const fileName = file.endsWith(".ts") ? file : `${file}.ts`;
  const output = ts.transpileModule(source, { compilerOptions: TRANSPILE_OPTIONS, fileName, reportDiagnostics: true });
  let syntaxErrors = false;
  for (const diagnostic of output.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue;
    syntaxErrors = true;
    // Plain .ts files: TS positions are source positions. Generated code: the
    // compiler already reported (TZS024/TZS015) what makes it invalid.
    if (innerMap === undefined && diagnostic.file && diagnostic.start !== undefined) {
      const start = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
      const end = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start + (diagnostic.length ?? 1));
      diagnostics.push({
        file,
        line: start.line + 1,
        column: start.character,
        endLine: end.line + 1,
        endColumn: end.character,
        severity: "error",
        code: `TS${diagnostic.code}`,
        message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      });
    } else if (innerMap !== undefined) {
      diagnostics.push({ ...internalError(file, ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")), code: `TS${diagnostic.code}` });
    }
  }
  if (syntaxErrors) return undefined;

  const code = rewriteSpecifiers(files, file, output.outputText.replace(/\/\/# sourceMappingURL=.*$/m, ""));
  const map = output.sourceMapText
    ? innerMap
      ? chainSourceMaps(innerMap, output.sourceMapText, file, files[file]!)
      : withSource(output.sourceMapText, file, files[file]!)
    : undefined;
  const module: CompiledModule = { id: moduleIdFor(file), file, code };
  if (map) module.map = map;
  if (innerMap === undefined) module.workerCode = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }, fileName: `${fileName}.js` }).outputText;
  return module;
}

/**
 * A worker's module URL (`new URL("./x.worker.ts", import.meta.url)`, the form
 * Vite bundles) → `globalThis.__tsazorWorkerUrl("<module id>")`: in the
 * preview a module's `import.meta.url` is a blob URL (no base for a relative
 * path), and a worker needs a module graph of its own (workers don't inherit
 * the import map). The preview and the lesson gate provide the function.
 */
function rewriteWorkerUrls(files: Files, file: string, code: string): string {
  return code.replace(/new\s+URL\(\s*(["'])(\.{1,2}\/[^"']*)\1\s*,\s*import\.meta\.url\s*\)/g, (match, _quote: string, specifier: string) => {
    const target = resolveModuleFile(files, specifier, file);
    return target ? `globalThis.__tsazorWorkerUrl(${JSON.stringify(moduleIdFor(target))})` : match;
  });
}

/** Relative specifiers → module ids; unknown relative imports stay (and fail loudly at load). */
function rewriteSpecifiers(files: Files, file: string, code: string): string {
  code = rewriteWorkerUrls(files, file, code);
  return code.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"']*)\2/g, (match, lead: string, quote: string, specifier: string) => {
    const target = resolveModuleFile(files, specifier, file);
    if (!target) return match;
    // A plain stylesheet import (`import "./x.css"`): the CSS is injected globally.
    if (target.endsWith(".css")) return `${lead}${quote}data:text/javascript,${quote}`;
    return `${lead}${quote}${moduleIdFor(target)}${quote}`;
  });
}

function withSource(mapText: string, file: string, source: string): string {
  const map = JSON.parse(mapText) as { sources: string[]; sourcesContent?: string[] };
  map.sources = [basename(file)];
  map.sourcesContent = [source];
  return JSON.stringify(map);
}

/** JS → generated TS (outer) chained with generated TS → .tsazor (inner). */
function chainSourceMaps(innerMap: string, outerMap: string, file: string, source: string): string {
  const inner = new TraceMap(innerMap);
  const outer = new TraceMap(outerMap);
  const gen = new GenMapping({ file: `${basename(file)}.js` });
  eachMapping(outer, (mapping) => {
    if (mapping.originalLine === null || mapping.originalColumn === null) return;
    const original = originalPositionFor(inner, { line: mapping.originalLine, column: mapping.originalColumn });
    if (original.line === null || original.column === null) return;
    addMapping(gen, {
      generated: { line: mapping.generatedLine, column: mapping.generatedColumn },
      original: { line: original.line, column: original.column },
      source: basename(file),
    });
  });
  const encoded = toEncodedMap(gen);
  return JSON.stringify({ ...encoded, sources: [basename(file)], sourcesContent: [source] });
}

function fromCompiler(file: string, diagnostic: TszDiagnostic): Diagnostic {
  return {
    file,
    line: diagnostic.pos.line,
    column: diagnostic.pos.column,
    endLine: diagnostic.endPos.line,
    endColumn: diagnostic.endPos.column,
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
  };
}

function internalError(file: string, error: unknown): Diagnostic {
  const message = error instanceof Error ? error.message : String(error);
  return { file, line: 1, column: 0, endLine: 1, endColumn: 0, severity: "error", code: "internal", message };
}
