import { compile, type TypedTagInferenceRequest } from "@tsazor/compiler";
import { collectImports, createFileContext, rebaseSpecifier, resolutionOptions } from "@tsazor/workspace";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { TsazorGenMap } from "./ts-mapping.js";

/**
 * Shadow modules for the TypeScript type layer: the generated TS of a .tsazor
 * file (plus the imports the build pipeline would emit), living at a synthetic
 * in-memory path next to the real file so every relative import resolves
 * without rewriting. Mirrors packages/vite-plugin/src/transform.ts (shared
 * resolution incl. inherited @imports, code-behind) plus two v2-specific
 * rewrites:
 *   A. imports of other .tsazor components → that component's own shadow
 *      (`./Sparkline.tsazor` → `./Sparkline.tsazor.gen`), chaining types through
 *      real component sources instead of surface d.ts.
 *   B. bare-package components (`@tsazor/components`) → the component's shipped
 *      .tsazor source shadow (the package's dist d.ts is deliberately `any`).
 */

export interface ShadowModule {
  /** Synthetic module path: `<dir>/<Name>.tsazor.gen.ts` next to the real file. */
  virtualPath: string;
  /** The real .tsazor file this shadow was generated from. */
  realPath: string;
  /** Generated TS source (import header rewritten). */
  code: string;
  /** Raw mappings behind the generated code, for position translation. */
  map: TsazorGenMap;
  className: string;
  /** 2.4: the tag-level `TItem` inference requests when the shadow was built
   *  without resolved type arguments for all generic tags. */
  typedInference?: readonly TypedTagInferenceRequest[];
}

/** Synthetic path of a shadow module: `X.tsazor` → `X.tsazor.gen.ts`. */
export function shadowPathFor(tsazorPath: string): string {
  return `${path.resolve(tsazorPath)}.gen.ts`;
}

/** True when the module path is a shadow (not a real file). */
export function isShadowPath(modulePath: string): boolean {
  return modulePath.replace(/\\/g, "/").endsWith(".tsazor.gen.ts");
}

/** The .tsazor file behind a shadow path (or undefined for anything else). */
export function tsazorOfShadowPath(modulePath: string): string | undefined {
  if (!isShadowPath(modulePath)) return undefined;
  return modulePath.replace(/\\/g, "/").replace(/\.gen\.ts$/, "");
}

/** Compiles one .tsazor to its shadow. `typeArguments` injects the inference
 *  pass's resolved type arguments (keyed by tag `"line:column"`, 2.4) and is
 *  set on the second pass of a generic tag. */
export async function buildShadowModule(
  tsazorPath: string,
  source: string,
  projectRoot: string,
  typeArguments?: ReadonlyMap<string, ReadonlyMap<string, string>>,
): Promise<ShadowModule | null> {
  try {
    const filePath = path.resolve(tsazorPath);
    const fileDir = path.dirname(filePath);
    const chain = await collectImports(fileDir, projectRoot);

    if (path.basename(filePath) === "_Imports.tsazor") {
      // _Imports.tsazor contributes directives only; it is never a component.
      const virtualPath = shadowPathFor(filePath);
      return { virtualPath, realPath: filePath, code: "export default null;\n", map: new TsazorGenMap([]), className: "_Imports" };
    }

    const context = createFileContext(filePath, chain);
    const extraImports: string[] = [];

    // Code-behind sidecar: the generated class extends its default export.
    const codeBehindPath = `${filePath}.ts`;
    const codeBehindClass = existsSync(codeBehindPath) ? `${context.className}Base` : undefined;
    if (codeBehindClass) {
      extraImports.push(`import ${codeBehindClass} from "./${path.basename(codeBehindPath)}";`);
    }
    // (Scoped-CSS sidecars are typeless side-effect imports — skipped here.)

    const compiled = compile(source, {
      ...resolutionOptions(context),
      imports: extraImports,
      codeBehindClass,
      codeBehindSource: codeBehindClass ? readFileSync(codeBehindPath, "utf8") : undefined,
      generateSourceMap: true,
      // 2.4 typed checks — shadow-only emission: `satisfies` on attribute
      // values, typed slot contexts, rebased type imports, typed `@ref`.
      typedShadow: {
        ...(typeArguments !== undefined ? { typeArguments } : {}),
        rebaseTypeImport: (reference) => {
          // Reference types bind through the shadow graph: an import the
          // declaring module resolved relatively is rebased to the consuming
          // shadow's directory; bare package specifiers resolve anywhere.
          if (reference.specifier === undefined || reference.file === undefined) return undefined;
          return rebaseSpecifier(reference.specifier, path.dirname(path.resolve(reference.file)), fileDir);
        },
      },
    });

    const code = compiled.code
      .split("\n")
      .map((line) => rewriteImportLine(line, fileDir, projectRoot))
      .join("\n");

    return {
      virtualPath: shadowPathFor(filePath),
      realPath: filePath,
      code,
      map: new TsazorGenMap(compiled.mappings ?? []),
      className: context.className,
      ...(compiled.typedInference !== undefined ? { typedInference: compiled.typedInference } : {}),
    };
  } catch {
    // Compiler-level failures (TSZE000-style) → no type layer; the v1 layer
    // still publishes compiler diagnostics.
    return null;
  }
}

/* Import rewriting ---------------------------------------------------------- */

const IMPORT_LINE = /^import\s+([^;]+?)\s+from\s+["']([^"']+)["'];?\s*$/;

/** Rewrites one header import line for the v2 shadow graph; other lines pass through. */
function rewriteImportLine(line: string, fileDir: string, projectRoot: string): string {
  const match = IMPORT_LINE.exec(line);
  if (!match) return line;
  const [, clause, rawSpecifier] = match;
  const specifier = rawSpecifier!.replace(/^["']|["']$/g, "");

  // Rewrite A: relative specifier pointing at a sibling/library .tsazor source
  // → that component's own shadow module.
  if (specifier.startsWith(".")) {
    const target = path.resolve(fileDir, specifier);
    // relativeSpecifier strips ".ts"; a .tsazor import keeps the extension.
    const candidates = specifier.endsWith(".tsazor") ? [target] : [`${target}.tsazor`, `${target}.tsazor.ts`];
    const tsazor = candidates.find((candidate) => existsSync(candidate));
    if (tsazor) {
      return `import ${clause} from "${specifier}.gen";`;
    }
    return line;
  }

  // Rewrite B: bare package specifier (e.g. @tsazor/components) → the package's
  // shipped .tsazor sources when the named import is a component file there.
  if (specifier.startsWith("@") && specifier !== "@tsazor/runtime") {
    const exportName = clause ? namedImportsOf(clause) : [];
    if (exportName.length > 0) {
      let pkgDir: string | undefined;
      try {
        pkgDir = path.dirname(createRequire(path.join(projectRoot, "package.json")).resolve(path.join(specifier, "package.json")));
      } catch {
        return line;
      }
      for (const name of exportName) {
        const source = path.join(pkgDir, "src", `${name}.tsazor`);
        if (existsSync(source)) {
          return `import ${clause} from "${toPosix(shadowPathFor(source))}";`;
        }
      }
    }
  }
  return line;
}

/** Named bindings of an import clause: `Alert as __tsazor_comp_Alert` or `{ Card }` → the exported names. */
function namedImportsOf(clause: string): string[] {
  const named = /\{([^}]*)\}/.exec(clause);
  if (!named) return [];
  const names: string[] = [];
  for (const piece of named[1]!.split(",")) {
    const binding = piece.split(/\s+as\s+/)[0]?.trim();
    if (binding) names.push(binding);
  }
  return names;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}