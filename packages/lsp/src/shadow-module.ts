import {
  compile,
  DiagnosticBag,
  parseDocument,
  parseImportDirective,
  type ExpressionValue,
  type ImportSuggestion,
  type SourceMapEntry,
  type TypedTagInferenceRequest,
  type UninferredTypeArguments,
} from "@tsazor/compiler";
import { collectImports, createFileContext, mapPath, rebaseSpecifier, resolutionOptions } from "@tsazor/workspace";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import * as ts from "typescript";
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
  /** The specifiers of the `@import`s inherited from _Imports.tsazor files: their errors are reported there. */
  inheritedSpecifiers?: ReadonlySet<string>;
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

    if (path.basename(filePath) === "_Imports.tsazor") return importsShadow(filePath, source);

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
          // shadow's directory; a bare package specifier resolves from the
          // declaring module when the app can't see the package itself.
          if (reference.specifier === undefined || reference.file === undefined) return undefined;
          if (!reference.specifier.startsWith(".")) return bareTypeSpecifier(reference.specifier, path.resolve(reference.file), fileDir);
          return rebaseSpecifier(reference.specifier, path.dirname(path.resolve(reference.file)), fileDir);
        },
      },
    });

    // The import rewrites (rewriteImportLine) may split one compiled import
    // line into several (rewrite B's per-component shadows). The compiler's
    // mappings were computed for the pre-split code: every generated line
    // after a split shifts with it, or the map sends the type layer to the
    // wrong statement — X1 (the showcase's multi-name component `@import` left
    // a DataGrid's TGridItem uninferred, RZ10001) came from exactly that.
    const rawLines = compiled.code.split("\n");
    const outLines: string[] = [];
    const inserted = new Array<number>(rawLines.length); // how many extra lines each raw line became
    let shiftSum = 0;
    const cumulative: number[] = [];
    for (let index = 0; index < rawLines.length; index++) {
      cumulative.push(shiftSum);
      const parts = rewriteImportLine(rawLines[index]!, fileDir, projectRoot).split("\n");
      inserted[index] = parts.length - 1;
      shiftSum += inserted[index]!;
      for (const part of parts) outLines.push(part);
    }
    const mappings = (compiled.mappings ?? []).map((entry) => ({ ...entry, genLine: entry.genLine + (cumulative[Math.min(entry.genLine - 1, cumulative.length - 1)] ?? 0) }));

    const code = outLines.join("\n");

    return {
      virtualPath: shadowPathFor(filePath),
      realPath: filePath,
      // The component class ships as `export default class`; keep it importable
      // by name too — apps import package components as named imports
      // (`import { Button } from "@tsazor/fluent"` → rewrite B → shadow).
      code: `${code.trimEnd()}\nexport { ${context.className} };\n`,
      map: new TsazorGenMap(mappings),
      className: context.className,
      ...(compiled.typedInference !== undefined ? { typedInference: compiled.typedInference } : {}),
      ...(compiled.uninferredTypeArguments !== undefined ? { uninferredTypeArguments: compiled.uninferredTypeArguments } : {}),
      ...(compiled.expressionValues !== undefined ? { expressionValues: compiled.expressionValues } : {}),
      ...(compiled.importSuggestions !== undefined ? { importSuggestions: compiled.importSuggestions } : {}),
      inheritedSpecifiers: new Set(context.inheritedImports.map((info) => info.specifier)),
    };
  } catch {
    // Compiler-level failures (TZS035-style) → no type layer; the v1 layer
    // still publishes compiler diagnostics.
    return null;
  }
}

/**
 * _Imports.tsazor contributes directives only; it is never a component. Its shadow is its own `@import`s, each line
 * mapped onto its directive: an import that doesn't resolve (a typo in the specifier, a name the module doesn't
 * export) is reported here, once — in the files below that inherit it, the import is plumbing that maps nowhere.
 */
function importsShadow(filePath: string, source: string): ShadowModule {
  const lines: string[] = [];
  const mappings: SourceMapEntry[] = [];
  for (const directive of parseDocument(source, new DiagnosticBag()).directives) {
    if (directive.name !== "import" || !parseImportDirective(directive.value).ok) continue;
    const valueStart = directive.valueStart ?? directive.pos;
    mappings.push({ genLine: lines.length + 1, genCol: 0, srcLine: directive.pos.line - 1, srcCol: directive.pos.column });
    directive.value.split("\n").forEach((part, index) => {
      const prefix = index === 0 ? "import " : "";
      mappings.push({ genLine: lines.length + 1, genCol: prefix.length, srcLine: valueStart.line - 1 + index, srcCol: index === 0 ? valueStart.column : 0 });
      lines.push(`${prefix}${part}`);
    });
    if (!directive.value.trimEnd().endsWith(";")) lines[lines.length - 1] += ";";
  }
  const code = `${lines.map((line) => `${line}\n`).join("")}export {};\n`;
  return { virtualPath: shadowPathFor(filePath), realPath: filePath, code, map: new TsazorGenMap(mappings), className: "_Imports" };
}

/* Type imports of parameter types -------------------------------------------- */

const RESOLUTION: ts.CompilerOptions = { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
const bareTypeSpecifiers = new Map<string, string>();

/**
 * A parameter type's bare import as the consuming shadow writes it: the specifier itself when the app resolves the
 * package too, else the file the declaring module resolves it to. Under pnpm a skin's own dependency (`@tsazor/ui`,
 * where `Intent` and `Size` live) is not visible from the app: the unresolved import left those parameters `any`.
 */
function bareTypeSpecifier(specifier: string, declaringFile: string, fileDir: string): string {
  const key = `${specifier}\0${declaringFile}\0${fileDir}`;
  const known = bareTypeSpecifiers.get(key);
  if (known !== undefined) return known;
  let result = specifier;
  if (ts.resolveModuleName(specifier, path.join(fileDir, "index.ts"), RESOLUTION, ts.sys).resolvedModule === undefined) {
    const declared = ts.resolveModuleName(specifier, declaringFile, RESOLUTION, ts.sys).resolvedModule;
    if (declared !== undefined) {
      const target = declared.resolvedFileName.replace(/\.d\.(m|c)?ts$|\.(m|c)?ts$/, "");
      const relative = path.relative(fileDir, target).replace(/\\/g, "/");
      result = path.isAbsolute(relative) || relative.startsWith("../") ? relative : `./${relative}`;
    }
  }
  bareTypeSpecifiers.set(key, result);
  return result;
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

  // Rewrite A, through the app's tsconfig `paths` (`@/components/layout/AppShell.tsazor`): the component's shadow
  // too — else the ambient `*.tsazor` declaration types the import as a ComponentType, not its class.
  if (specifier.endsWith(".tsazor")) {
    const mapped = mapPath(specifier, path.join(fileDir, "_")).find((candidate) => existsSync(candidate));
    if (mapped) {
      let relative = toPosix(path.relative(fileDir, mapped));
      if (!relative.startsWith(".")) relative = `./${relative}`;
      return `import ${clause} from "${relative}.gen";`;
    }
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
 * package's components were never used and their methods (a DataGrid's `scrollToItemAsync`) were missing.
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