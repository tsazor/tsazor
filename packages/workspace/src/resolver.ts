import type { ResolvedComponent, ResolvedType } from "@tsazor/compiler";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { RUNTIME_COMPONENTS, RUNTIME_PACKAGE, RUNTIME_TYPES } from "./builtins";
import { candidateDirs, relativeSpecifier, type ImportsChain } from "./imports";

/** Everything the transform needs to compile one .tsazor file. */
export interface FileContext {
  /** Absolute .tsazor path (query-stripped). */
  filePath: string;
  fileDir: string;
  className: string;
  chain: ImportsChain;
  resolveComponent: (tagName: string, usings: string[]) => ResolvedComponent | null;
  resolveType: (name: string, usings: string[]) => ResolvedType | null;
  /** Absolute path of a resolvable single-name component file, if any. */
  resolveImportable: (name: string) => string | undefined;
  /** Resolves a @layout name to an absolute .tsazor path. */
  resolveLayout: (layoutName: string) => string | undefined;
}

/** Derives the component class name from the file name (Blazor: file name = type name). */
export function classNameForFile(filePath: string): string {
  const base = path.basename(filePath).replace(/\.[^.]+$/, "");
  const sanitized = base.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

/**
 * Builds the resolution context for one .tsazor file: its own directory plus
 * every directory named by path-like @using values in its _Imports chain.
 * Bare specifiers (`@using @tsazor/runtime`) resolve lazily per type name.
 */
export function createFileContext(filePath: string, chain: ImportsChain): FileContext {
  const resolved = path.resolve(filePath);
  const fileDir = path.dirname(resolved);
  const dirs = candidateDirs(fileDir, chain);

  const findInDirs = (name: string, extensions: string[]): string | undefined => {
    for (const dir of dirs) {
      for (const extension of extensions) {
        const candidate = path.join(dir, `${name}${extension}`);
        if (existsSync(candidate)) return candidate;
      }
    }
    return undefined;
  };

  /** First .ts file in the candidate dirs that exports `name` (declaration or
   *  `export {…}` list); declaration files (.d.ts) are skipped. */
  const findExportedFrom = (name: string): string | undefined => {
    for (const dir of dirs) {
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }
      for (const entry of entries.sort()) {
        if (!entry.endsWith(".ts") || entry.endsWith(".d.ts")) continue;
        const candidate = path.join(dir, entry);
        if (existsSync(candidate) && exportsOf(candidate).has(name)) return candidate;
      }
    }
    return undefined;
  };

  const context: FileContext = {
    filePath: resolved,
    fileDir,
    className: classNameForFile(resolved),
    chain,
    resolveComponent: (tagName) => {
      const target = findInDirs(tagName, [".tsazor"]);
      if (target) return { specifier: relativeSpecifier(fileDir, target) };
      // Runtime built-ins (Blazor's Web namespace via _Imports).
      if (RUNTIME_COMPONENTS.has(tagName)) return { specifier: RUNTIME_PACKAGE, exportName: tagName };
      // Bare-specifier usings (`@using @tsazor/components`): trust the module
      // to export the name — the import only fails at runtime if it does not.
      const bare = context.chain.usings.find((using) => !isPathLikeUsing(using));
      if (bare) return { specifier: stripQuotes(bare), exportName: tagName };
      return null;
    },
    resolveType: (name) => {
      const localType = findInDirs(name, [".ts", ".tsazor"]);
      if (localType) {
        return { specifier: relativeSpecifier(fileDir, localType) };
      }
      // Named export of any .ts module in the candidate dirs (Blazor: folders
      // are namespaces; here a barrel like `models.ts` exporting `Address`).
      const exportedFrom = findExportedFrom(name);
      if (exportedFrom) {
        return { specifier: relativeSpecifier(fileDir, exportedFrom), exportName: name };
      }
      // JS globals (Math, Date, …) and TS utility types (Record, Pick, …)
      // already exist in scope — the bare-package trust branch below would
      // otherwise emit `import { Math } from "<pkg>"` for a plain global
      // reference and break the bundle. Local files/exports above may still
      // shadow a global intentionally.
      if (isJsGlobal(name)) return null;
      if (RUNTIME_TYPES.has(name)) {
        return { specifier: RUNTIME_PACKAGE, exportName: name };
      }
      // Bare-specifier usings (`@using @tsazor/runtime`): trust the module to
      // export the name — the import only fails at runtime if it does not.
      const bare = context.chain.usings.find((using) => !isPathLikeUsing(using));
      if (bare) {
        return { specifier: stripQuotes(bare), exportName: name };
      }
      return null;
    },
    resolveImportable: (name) => {
      return findInDirs(name, [".tsazor"]);
    },
    resolveLayout: (layoutName) => {
      return findInDirs(layoutName, [".tsazor"]);
    },
  };
  return context;
}

/* JS globals ------------------------------------------------------------------ */

/** Runtime globals (`Object.getOwnPropertyNames(globalThis)`) plus the TS
 *  utility types, which live on the type side but are referenced by the same
 *  PascalCase identifiers. Nothing here should ever be turned into an import. */
const JS_GLOBALS: ReadonlySet<string> = new Set([
  ...Object.getOwnPropertyNames(globalThis),
  "Record", "Partial", "Readonly", "Required", "Pick", "Omit",
  "Exclude", "Extract", "NonNullable", "ReturnType", "InstanceType",
  "Parameters", "ConstructorParameters", "Awaited", "ThisType",
  "Uppercase", "Lowercase", "Capitalize", "Uncapitalize",
]);

function isJsGlobal(name: string): boolean {
  return JS_GLOBALS.has(name);
}

function isPathLikeUsing(using: string): boolean {
  const value = stripQuotes(using);
  if (value.startsWith("@")) return false; // scoped npm package
  return value.startsWith(".") || value.startsWith("/") || /[\\/]/.test(value);
}

/* Named-export scan ---------------------------------------------------------- */

const EXPORT_DECLARATION =
  /\bexport\s+(?:default\s+)?(?:abstract\s+)?(?:declare\s+)?(?:async\s+)?(?:interface|type|enum|class|function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const EXPORT_LIST = /\bexport\s*\{([^}]*)\}/g;

const exportCache = new Map<string, { mtimeMs: number; names: Set<string> }>();

/** Named exports of one .ts file (declaration + `export {…}` lists), cached
 *  per file+mtime — the resolver runs on every compile and rebuild. */
function exportsOf(tsFile: string): Set<string> {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(tsFile).mtimeMs;
  } catch {
    return new Set();
  }
  const cached = exportCache.get(tsFile);
  if (cached && cached.mtimeMs === mtimeMs) return cached.names;
  let source = "";
  try {
    source = readFileSync(tsFile, "utf8");
  } catch {
    return new Set();
  }
  const names = new Set<string>();
  for (const match of source.matchAll(EXPORT_DECLARATION)) names.add(match[1]!);
  for (const match of source.matchAll(EXPORT_LIST)) {
    for (const piece of match[1]!.split(",")) {
      const name = piece.split(/\s+as\s+/)[0]?.trim();
      if (name) names.add(name);
    }
  }
  exportCache.set(tsFile, { mtimeMs, names });
  return names;
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}