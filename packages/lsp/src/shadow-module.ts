import { compile, type ExpressionValue, type ImportSuggestion, type TypedTagInferenceRequest, type UninferredTypeArguments } from "@tsazor/compiler";
import { collectImports, createFileContext, rebaseSpecifier, resolutionOptions } from "@tsazor/workspace";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
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
 *   B. bare-package components (`@tsazor/bootstrap`) → the component's shipped
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
  /** The generic tags whose type arguments stay open (Razor's RZ10001): errors inside them get a hint. */
  uninferredTypeArguments?: readonly UninferredTypeArguments[];
  /** 2.4: plain-text values of non-string parameters — unknown names in them get a note. */
  expressionValues?: readonly ExpressionValue[];
  /** F29: the `@import` each unbound name in `@code` would need (TS2304's hint and quick fix). */
  importSuggestions?: readonly ImportSuggestion[];
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
      // The component class ships as `export default class`; keep it importable
      // by name too — apps import package components as named imports
      // (`import { Button } from "@tsazor/fluent"` → rewrite B → shadow).
      code: `${code.trimEnd()}\nexport { ${context.className} };\n`,
      map: new TsazorGenMap(compiled.mappings ?? []),
      className: context.className,
      ...(compiled.typedInference !== undefined ? { typedInference: compiled.typedInference } : {}),
      ...(compiled.uninferredTypeArguments !== undefined ? { uninferredTypeArguments: compiled.uninferredTypeArguments } : {}),
      ...(compiled.expressionValues !== undefined ? { expressionValues: compiled.expressionValues } : {}),
      ...(compiled.importSuggestions !== undefined ? { importSuggestions: compiled.importSuggestions } : {}),
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

  // Rewrite B: bare package specifier (e.g. @tsazor/bootstrap) → the package's
  // shipped .tsazor sources when the named import is a component file there.
  // Names can come from DIFFERENT component files (e.g. Accordion + AccordionItem
  // in one @import) — each name whose source exists is rebound to its own shadow;
  // names without component source stay on the package module (types from the
  // shipped d.ts), so an import spreads into at most two statements.
  if (specifier.startsWith("@") && specifier !== "@tsazor/runtime") {
    const bindings = namedBindingsOf(clause ?? "");
    if (bindings.length > 0) {
      const pkgDir = packageDirOf(specifier, projectRoot);
      if (pkgDir === undefined) return line;
      const rebased: { binding: NamedBinding; shadow: string }[] = [];
      const plain: NamedBinding[] = [];
      for (const binding of bindings) {
        const source = path.join(pkgDir, "src", `${binding.imported}.tsazor`);
        if (existsWithCase(source)) {
          rebased.push({ binding, shadow: toPosix(shadowPathFor(source)) });
        } else {
          plain.push(binding);
        }
      }
      if (rebased.length === 0) return line;
      const prefix = /^\s*type\b/.test(clause ?? "") ? "import type" : "import";
      // An inline `type` stays on its name (`{ Chart, type ChartSeries }`); under `import type` it is implied.
      const bindingText = (binding: NamedBinding) =>
        `${binding.typeOnly && prefix === "import" ? "type " : ""}${binding.local === binding.imported ? binding.imported : `${binding.imported} as ${binding.local}`}`;
      const lines = rebased.map((r) => `${prefix} { ${bindingText(r.binding)} } from "${r.shadow}";`);
      if (plain.length > 0) {
        lines.push(`${prefix} { ${plain.map(bindingText).join(", ")} } from "${specifier}";`);
      }
      return lines.join("\n");
    }
  }
  return line;
}

/**
 * The directory of the installed package `specifier`, as `require.resolve` would find it (symlinks resolved), without
 * resolving `<package>/package.json`: a package whose `exports` don't list it refuses that. Windows let the
 * backslashed `path.join(specifier, "package.json")` through, Linux and macOS didn't, so there the shadows of a
 * package's components were never used and their methods (a DataGrid's `scrollToItem`) were missing.
 */
function packageDirOf(specifier: string, projectRoot: string): string | undefined {
  const searchPaths = createRequire(path.join(projectRoot, "package.json")).resolve.paths(specifier) ?? [];
  for (const dir of searchPaths) {
    const candidate = path.join(dir, specifier);
    if (existsSync(path.join(candidate, "package.json"))) {
      try {
        return realpathSync(candidate);
      } catch {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * The file exists under exactly this name. Windows and macOS file systems
 * ignore case: `tooltip` (a helper export) would otherwise find the
 * component `Tooltip.tsazor` and bind to its shadow.
 */
function existsWithCase(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    return readdirSync(path.dirname(file)).includes(path.basename(file));
  } catch {
    return false;
  }
}

/** One named import binding: imported name, (aliased) local name, and an inline `type`. */
interface NamedBinding {
  imported: string;
  local: string;
  typeOnly: boolean;
}

/**
 * Named bindings of an import clause (`{ Card, Button as B, type Size }`); default/namespace clauses yield nothing.
 * An inline `type` is kept: dropping its name lost `ChartSeries` from `{ Chart, type ChartSeries }`.
 */
function namedBindingsOf(clause: string): NamedBinding[] {
  const named = /\{([^}]*)\}/.exec(clause);
  if (!named) return [];
  const bindings: NamedBinding[] = [];
  for (const piece of named[1]!.split(",")) {
    const typed = /^\s*type\s+/.exec(piece);
    const [importedPart, aliasPart] = piece.slice(typed?.[0].length ?? 0).split(/\s+as\s+/).map((part) => part?.trim());
    const imported = importedPart ?? "";
    if (!/^[\w$.]+$/.test(imported)) continue;
    const local = aliasPart || imported;
    bindings.push({ imported, local, typeOnly: typed !== null });
  }
  return bindings;
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}