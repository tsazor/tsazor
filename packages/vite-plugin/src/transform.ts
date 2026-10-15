import { compile, DECORATOR_HELPER_PROBE, shareHelpers, sharedHelperModule, type CompileOptions, type SharedHelpers, type CompileResult, type DiagnosticBag, type TszDiagnostic } from "@tsazor/compiler";
import { transformSync } from "esbuild";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { hmrAppendix } from "./hmr.js";
import { scopeHashFor } from "./scoped-css.js";
import { chainSourceMaps } from "./sourcemap.js";
import { collectImports, createFileContext, resolutionOptions } from "@tsazor/workspace";

/** Options for `transformTsazor`. */
export interface TransformTsazorOptions {
  /** Emit a chained .tsazor → JS sourcemap (default true). */
  sourceMap?: boolean;
  /** Append the HMR accept block (default true; harnesses outside Vite turn it off). */
  hmr?: boolean;
  /** F1a static markup blocks (default true). */
  staticMarkup?: boolean;
  /** H1 render hints — stable event handlers (default true). */
  renderHints?: boolean;
  /** Every invisible compiler optimization (default true); `false` turns `staticMarkup` and `renderHints` off. */
  optimize?: boolean;
  /**
   * Import esbuild's decorator helpers from this module (the plugin's `virtual:tsazor-decorators`) instead of declaring
   * them in the component; without it each component carries its own copy (harnesses outside Vite).
   */
  sharedHelpers?: string;
}

/** How esbuild transforms a compiled component: standard (TC39) decorators lowered, [[Define]] class fields. */
const ESBUILD_OPTIONS = {
  loader: "ts",
  // Standard (TC39) decorators and [[Define]] class fields (TS's ES2022
  // default); no engine runs decorators natively yet, so esbuild lowers them.
  supported: { decorators: false },
  tsconfigRaw: { compilerOptions: { target: "es2022" } },
} as const;

let decoratorHelpers: SharedHelpers | undefined;

/** esbuild's decorator helpers as one module, from a probe transformed as the components are (computed once). */
export function sharedDecoratorHelpers(): SharedHelpers {
  return (decoratorHelpers ??= sharedHelperModule(transformSync(DECORATOR_HELPER_PROBE, ESBUILD_OPTIONS).code));
}

/** What `transformTsazor` returns: the JS module, its sourcemap, the diagnostics and the HMR metadata. */
export interface TransformTsazorResult {
  /** Browser-ready JS module (HMR appendix included). */
  code: string;
  /** The .tsazor → JS sourcemap as JSON text; `null` with `sourceMap: false` or on compile errors. */
  map: string | null;
  /** Diagnostics of the compile (errors are not thrown here). */
  diagnostics: DiagnosticBag;
  /** Diagnostics of the _Imports.tsazor files in the chain, located in those files. */
  importsDiagnostics: ReadonlyArray<{ file: string; diagnostic: TszDiagnostic }>;
  /** 4.1: absolute component files the tags of this file resolved to (metadata edges). */
  componentFiles: string[];
  /** 4.1: compile metadata of the file (routes, unresolved tags, layout). */
  metadata: CompileResult["metadata"];
}

/**
 * The plugin's .tsazor → JS pipeline, independent of Vite: `_Imports` chain
 * (inherited `@import`s rebased to the file), component/type resolution,
 * code-behind and scoped-CSS sidecars, then esbuild. Shared by the plugin's
 * transform hook and by test harnesses, so tests exercise exactly what the
 * dev server serves. Nothing is imported by guessing: free names in markup
 * and @code resolve only through explicit `@import`s.
 */
export async function transformTsazor(
  code: string,
  filePath: string,
  projectRoot: string,
  options: TransformTsazorOptions = {},
): Promise<TransformTsazorResult> {
  const sourceMap = options.sourceMap !== false;
  const chain = await collectImports(path.dirname(filePath), projectRoot);
  const context = createFileContext(filePath, chain);
  const extraImports: string[] = [];
  /** Which local component files the tags resolve to — HMR invalidation edges (4.1). */
  const componentFiles = new Set<string>();
  const resolveComponentMetadata: NonNullable<CompileOptions["resolveComponentMetadata"]> = (tagName, usings, imports) => {
    const metadata = context.resolveComponentMetadata(tagName, usings, imports);
    if (metadata?.file !== undefined && path.isAbsolute(metadata.file)) componentFiles.add(metadata.file);
    return metadata;
  };

  // Code-behind: when a sibling X.tsazor.ts exists (the compiled module's
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
    ...resolutionOptions(context),
    resolveComponentMetadata,
    fileName: filePath,
    imports: extraImports,
    codeBehindClass,
    codeBehindSource: codeBehindClass ? readFileSync(codeBehindPath, "utf8") : undefined,
    scopeHash,
    generateSourceMap: sourceMap,
    ...(options.staticMarkup === false ? { staticMarkup: false } : {}),
    ...(options.renderHints === false ? { renderHints: false } : {}),
    ...(options.optimize === false ? { optimize: false } : {}),
  });

  const importsDiagnostics = chain.layers.flatMap((layer) =>
    layer.diagnostics.map((diagnostic) => ({ file: layer.file, diagnostic })),
  );
  let transpiled: ReturnType<typeof transformSync>;
  try {
    transpiled = transformSync(compiled.code, { ...ESBUILD_OPTIONS, sourcemap: sourceMap, sourcefile: `${filePath}.ts` });
  } catch (error) {
    // Generated code from erroneous source may not parse (a TZS024 syntax
    // error): the located compiler diagnostics explain it, not esbuild.
    if (compiled.diagnostics.hasErrors) return { code: "", map: null, diagnostics: compiled.diagnostics, importsDiagnostics, componentFiles: [...componentFiles], metadata: compiled.metadata };
    throw error;
  }

  const map = sourceMap
    ? chainSourceMaps(compiled.map!, transpiled.map!, filePath, `${path.basename(filePath)} (tsazor)`)
    : null;
  const hmr = options.hmr !== false ? hmrAppendix(context.className) : "";
  const output = options.sharedHelpers === undefined ? transpiled.code : shareHelpers(transpiled.code, sharedDecoratorHelpers(), options.sharedHelpers);
  return { code: output + hmr, map, diagnostics: compiled.diagnostics, importsDiagnostics, componentFiles: [...componentFiles], metadata: compiled.metadata };
}
