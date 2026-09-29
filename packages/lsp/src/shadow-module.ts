import { compile, type ResolvedComponent, type ResolvedType } from "@tasor/compiler";
import { collectCodeImports, collectImports, createFileContext, RUNTIME_TYPES } from "@tasor/workspace";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { TazorGenMap } from "./ts-mapping";

/**
 * Shadow modules for the TypeScript type layer: the generated TS of a .tazor
 * file (plus the imports the build pipeline would emit), living at a synthetic
 * in-memory path next to the real file so every relative import resolves
 * without rewriting. Mirrors packages/vite-plugin/src/index.ts transform()
 * (pass-1 import collection, code-behind, knownGlobals) plus two v2-specific
 * rewrites:
 *   A. imports of other .tazor components → that component's own shadow
 *      (`./Sparkline.tazor` → `./Sparkline.tazor.gen`), chaining types through
 *      real component sources instead of surface d.ts.
 *   B. bare-package components (`@tasor/components`) → the component's shipped
 *      .tazor source shadow (the package's dist d.ts is deliberately `any`).
 */

export interface ShadowModule {
  /** Synthetic module path: `<dir>/<Name>.tazor.gen.ts` next to the real file. */
  virtualPath: string;
  /** The real .tazor file this shadow was generated from. */
  realPath: string;
  /** Generated TS source (import header rewritten). */
  code: string;
  /** Raw mappings behind the generated code, for position translation. */
  map: TazorGenMap;
  className: string;
}

/** Synthetic path of a shadow module: `X.tazor` → `X.tazor.gen.ts`. */
export function shadowPathFor(tazorPath: string): string {
  return `${path.resolve(tazorPath)}.gen.ts`;
}

/** True when the module path is a shadow (not a real file). */
export function isShadowPath(modulePath: string): boolean {
  return modulePath.replace(/\\/g, "/").endsWith(".tazor.gen.ts");
}

/** The .tazor file behind a shadow path (or undefined for anything else). */
export function tazorOfShadowPath(modulePath: string): string | undefined {
  if (!isShadowPath(modulePath)) return undefined;
  return modulePath.replace(/\\/g, "/").replace(/\.gen\.ts$/, "");
}

export async function buildShadowModule(tazorPath: string, source: string, projectRoot: string): Promise<ShadowModule | null> {
  try {
    const filePath = path.resolve(tazorPath);
    const fileDir = path.dirname(filePath);
    const chain = await collectImports(fileDir, projectRoot);

    if (path.basename(filePath) === "_Imports.tazor") {
      // _Imports.tazor contributes directives only; it is never a component.
      const virtualPath = shadowPathFor(filePath);
      return { virtualPath, realPath: filePath, code: "export default null;\n", map: new TazorGenMap([]), className: "_Imports" };
    }

    const context = createFileContext(filePath, chain);

    // Runtime enums/values referenced anywhere (e.g. NavLinkMatch.All) must
    // not be baked to this.* — same scan as the vite plugin.
    const knownGlobals = new Set<string>();
    for (const match of source.matchAll(/\b[A-Z][A-Za-z0-9_$]*\b/g)) {
      if (RUNTIME_TYPES.has(match[0])) knownGlobals.add(match[0]);
    }

    // Pass 1 without extra imports: see which bindings the compiler emitted
    // itself, then add import lines for @code-block identifiers (pass 2).
    const first = compile(source, {
      className: context.className,
      fileName: filePath,
      resolveComponent: (tagName, usings): ResolvedComponent | null => context.resolveComponent(tagName, usings),
      resolveType: (name, usings): ResolvedType | null => context.resolveType(name, usings),
      generateSourceMap: false,
    });
    const extraImports = collectCodeImports(source, first.code, context);

    // Code-behind sidecar: the generated class extends its default export.
    const codeBehindPath = `${filePath}.ts`;
    const codeBehindClass = existsSync(codeBehindPath) ? `${context.className}Base` : undefined;
    if (codeBehindClass) {
      extraImports.push(`import ${codeBehindClass} from "./${path.basename(codeBehindPath)}";`);
    }
    // (Scoped-CSS sidecars are typeless side-effect imports — skipped here.)

    const compiled = compile(source, {
      className: context.className,
      fileName: filePath,
      resolveComponent: (tagName, usings): ResolvedComponent | null => context.resolveComponent(tagName, usings),
      resolveType: (name, usings): ResolvedType | null => context.resolveType(name, usings),
      knownGlobals,
      imports: extraImports,
      codeBehindClass,
      generateSourceMap: true,
    });

    const code = compiled.code
      .split("\n")
      .map((line) => rewriteImportLine(line, fileDir, projectRoot))
      .join("\n");

    return {
      virtualPath: shadowPathFor(filePath),
      realPath: filePath,
      code,
      map: new TazorGenMap(compiled.mappings ?? []),
      className: context.className,
    };
  } catch {
    // Compiler-level failures (TZRE000-style) → no type layer; the v1 layer
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

  // Rewrite A: relative specifier pointing at a sibling/library .tazor source
  // → that component's own shadow module.
  if (specifier.startsWith(".")) {
    const target = path.resolve(fileDir, specifier);
    // relativeSpecifier strips ".ts"; a .tazor import keeps the extension.
    const candidates = specifier.endsWith(".tazor") ? [target] : [`${target}.tazor`, `${target}.tazor.ts`];
    const tazor = candidates.find((candidate) => existsSync(candidate));
    if (tazor) {
      return `import ${clause} from "${specifier}.gen";`;
    }
    return line;
  }

  // Rewrite B: bare package specifier (e.g. @tasor/components) → the package's
  // shipped .tazor sources when the named import is a component file there.
  if (specifier.startsWith("@") && specifier !== "@tasor/runtime") {
    const exportName = clause ? namedImportsOf(clause) : [];
    if (exportName.length > 0) {
      let pkgDir: string | undefined;
      try {
        pkgDir = path.dirname(createRequire(path.join(projectRoot, "package.json")).resolve(path.join(specifier, "package.json")));
      } catch {
        return line;
      }
      for (const name of exportName) {
        const source = path.join(pkgDir, "src", `${name}.tazor`);
        if (existsSync(source)) {
          return `import ${clause} from "${toPosix(shadowPathFor(source))}";`;
        }
      }
    }
  }
  return line;
}

/** Named bindings of an import clause: `Alert as __tasor_comp_Alert` or `{ Card }` → the exported names. */
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