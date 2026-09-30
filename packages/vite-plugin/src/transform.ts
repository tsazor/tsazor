import { compile, type DiagnosticBag, type TszDiagnostic } from "@tsazor/compiler";
import { transformSync } from "esbuild";
import { existsSync } from "node:fs";
import path from "node:path";
import { hmrAppendix } from "./hmr.js";
import { scopeHashFor } from "./scoped-css.js";
import { chainSourceMaps } from "./sourcemap.js";
import { collectImports, createFileContext, resolutionOptions } from "@tsazor/workspace";

export interface TransformTsazorOptions {
  /** Emit a chained .tsazor → JS sourcemap (default true). */
  sourceMap?: boolean;
  /** Append the HMR accept block (default true; harnesses outside Vite turn it off). */
  hmr?: boolean;
}

export interface TransformTsazorResult {
  /** Browser-ready JS module (HMR appendix included). */
  code: string;
  map: string | null;
  /** Diagnostics of the compile (errors are not thrown here). */
  diagnostics: DiagnosticBag;
  /** Diagnostics of the _Imports.tsazor files in the chain, located in those files. */
  importsDiagnostics: ReadonlyArray<{ file: string; diagnostic: TszDiagnostic }>;
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
    fileName: filePath,
    imports: extraImports,
    codeBehindClass,
    scopeHash,
    generateSourceMap: sourceMap,
  });

  const transpiled = transformSync(compiled.code, {
    loader: "ts",
    sourcemap: sourceMap,
    sourcefile: `${filePath}.ts`,
    tsconfigRaw: {
      compilerOptions: {
        experimentalDecorators: true,
        useDefineForClassFields: false,
        target: "es2022",
      },
    },
  });

  const map = sourceMap
    ? chainSourceMaps(compiled.map!, transpiled.map!, filePath, `${path.basename(filePath)} (tsazor)`)
    : null;
  const hmr = options.hmr !== false ? hmrAppendix(context.className) : "";
  const importsDiagnostics = chain.layers.flatMap((layer) =>
    layer.diagnostics.map((diagnostic) => ({ file: layer.file, diagnostic })),
  );
  return { code: transpiled.code + hmr, map, diagnostics: compiled.diagnostics, importsDiagnostics };
}
