import type { ResolvedComponent, ResolvedType } from "@tasor/compiler";
import { existsSync } from "node:fs";
import path from "node:path";
import { RUNTIME_COMPONENTS, RUNTIME_PACKAGE, RUNTIME_TYPES } from "./builtins";
import { candidateDirs, relativeSpecifier, type ImportsChain } from "./imports";

/** Everything the transform needs to compile one .tazor file. */
export interface FileContext {
  /** Absolute .tazor path (query-stripped). */
  filePath: string;
  fileDir: string;
  className: string;
  chain: ImportsChain;
  resolveComponent: (tagName: string, usings: string[]) => ResolvedComponent | null;
  resolveType: (name: string, usings: string[]) => ResolvedType | null;
  /** Absolute path of a resolvable single-name component file, if any. */
  resolveImportable: (name: string) => string | undefined;
  /** Resolves a @layout name to an absolute .tazor path. */
  resolveLayout: (layoutName: string) => string | undefined;
}

/** Derives the component class name from the file name (Blazor: file name = type name). */
export function classNameForFile(filePath: string): string {
  const base = path.basename(filePath).replace(/\.[^.]+$/, "");
  const sanitized = base.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

/**
 * Builds the resolution context for one .tazor file: its own directory plus
 * every directory named by path-like @using values in its _Imports chain.
 * Bare specifiers (`@using @tasor/runtime`) resolve lazily per type name.
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

  const context: FileContext = {
    filePath: resolved,
    fileDir,
    className: classNameForFile(resolved),
    chain,
    resolveComponent: (tagName) => {
      const target = findInDirs(tagName, [".tazor"]);
      if (target) return { specifier: relativeSpecifier(fileDir, target) };
      // Runtime built-ins (Blazor's Web namespace via _Imports).
      if (RUNTIME_COMPONENTS.has(tagName)) return { specifier: RUNTIME_PACKAGE, exportName: tagName };
      // Bare-specifier usings (`@using @tasor/components`): trust the module
      // to export the name — the import only fails at runtime if it does not.
      const bare = context.chain.usings.find((using) => !isPathLikeUsing(using));
      if (bare) return { specifier: stripQuotes(bare), exportName: tagName };
      return null;
    },
    resolveType: (name) => {
      const localType = findInDirs(name, [".ts", ".tazor"]);
      if (localType) {
        return { specifier: relativeSpecifier(fileDir, localType) };
      }
      if (RUNTIME_TYPES.has(name)) {
        return { specifier: RUNTIME_PACKAGE, exportName: name };
      }
      // Bare-specifier usings (`@using @tasor/runtime`): trust the module to
      // export the name — the import only fails at runtime if it does not.
      const bare = context.chain.usings.find((using) => !isPathLikeUsing(using));
      if (bare) {
        return { specifier: stripQuotes(bare), exportName: name };
      }
      return null;
    },
    resolveImportable: (name) => {
      return findInDirs(name, [".tazor"]);
    },
    resolveLayout: (layoutName) => {
      return findInDirs(layoutName, [".tazor"]);
    },
  };
  return context;
}

function isPathLikeUsing(using: string): boolean {
  const value = stripQuotes(using);
  if (value.startsWith("@")) return false; // scoped npm package
  return value.startsWith(".") || value.startsWith("/") || /[\\/]/.test(value);
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}