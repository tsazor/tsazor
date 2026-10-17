import type { CompileOptions, ComponentMetadata, ImportInfo, InheritedAuthorization, ResolvedComponent, ResolvedType } from "@tsazor/compiler";
import { readdirSync } from "node:fs";
import path from "node:path";
import { RUNTIME_COMPONENTS, RUNTIME_PACKAGE, RUNTIME_TYPES } from "./builtins.js";
import { exportsOfFile, importKindOf, packageExports } from "./exports.js";
import { componentMetadataForTag } from "./metadata.js";
import {
  checkUsing,
  dirsInclude,
  enclosingDirs,
  inheritedAuthorization,
  inheritedImports,
  isPathLikeUsing,
  relativeSpecifier,
  stripQuotes,
  usingDirs,
  type ImportsChain,
} from "./imports.js";

/** Everything the transform needs to compile one .tsazor file. */
export interface FileContext {
  /** Absolute .tsazor path (query-stripped). */
  filePath: string;
  fileDir: string;
  className: string;
  chain: ImportsChain;
  /** The chain's @import directives, rebased to this file (nearest layer first). */
  inheritedImports: ImportInfo[];
  /** The chain's @authorize / @allowAnonymous, nearest layer first (B12). */
  inheritedAuthorization: InheritedAuthorization[];
  /** Resolves a component tag; `usings` are the file's own @using values. */
  resolveComponent: (tagName: string, usings: string[]) => ResolvedComponent | null;
  /**
   * Parameter metadata of the component a tag resolves to (same resolution as
   * resolveComponent; `imports` are the file's own @imports, which bind tags
   * directly). Null for unresolved tags and packages without a manifest.
   */
  resolveComponentMetadata: (tagName: string, usings: string[], imports?: readonly ImportInfo[]) => ComponentMetadata | null;
  /** Resolves an @inject type / @inherits base; `usings` are the file's own @using values. */
  resolveType: (name: string, usings: string[]) => ResolvedType | null;
  /** Checks one of the file's own @using values (TZS018 message or null). */
  resolveUsing: (value: string) => string | null;
  /** Absolute path of the .tsazor file a tag resolves to (not for runtime/package components). */
  componentFile: (tagName: string, usings?: string[]) => string | undefined;
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
 * Builds the resolution context for one .tsazor file. Component tags resolve
 * like C# type names: the file's own directory and every directory above it
 * up to the project root are enclosing namespaces (nearest wins); every @using source —
 * path directories, the runtime built-ins and bare packages (only names the
 * package really exports) — is searched as a whole, and a tag found in more
 * than one of them is ambiguous (TZS017).
 */
export function createFileContext(filePath: string, chain: ImportsChain): FileContext {
  const resolved = path.resolve(filePath);
  const fileDir = path.dirname(resolved);
  const enclosing = enclosingDirs(fileDir, chain);
  const chainUsingDirs = usingDirs(chain);

  /** Path directories of the chain plus the file's own path-like @usings. */
  const usingDirsFor = (usings: readonly string[]): string[] => {
    const dirs = [...chainUsingDirs];
    for (const using of usings) {
      if (!isPathLikeUsing(using)) continue;
      const value = stripQuotes(using);
      const dir = path.isAbsolute(value) ? value : path.resolve(fileDir, value);
      if (!dirsInclude(dirs, dir)) dirs.push(dir);
    }
    return dirs.filter((dir) => !dirsInclude(enclosing, dir));
  };
  /** Bare-package @usings of the chain and the file, deduplicated. */
  const packagesFor = (usings: readonly string[]): string[] => {
    const names: string[] = [];
    for (const using of [...usings, ...chain.usings]) {
      if (isPathLikeUsing(using)) continue;
      const name = stripQuotes(using);
      if (!names.includes(name)) names.push(name);
    }
    return names;
  };
  const listings = new Map<string, readonly string[]>();
  const inDir = (dir: string, name: string, extensions: readonly string[]): string | undefined => {
    let names = listings.get(dir);
    if (names === undefined) {
      try {
        names = readdirSync(dir);
      } catch {
        names = [];
      }
      listings.set(dir, names);
    }
    // The name's own case, as a case-sensitive file system (Linux, CI) sees it: on Windows `Shade` found shade.ts,
    // and the import it suggested (`./Shade`) broke elsewhere.
    for (const extension of extensions) {
      if (names.includes(`${name}${extension}`)) return path.join(dir, `${name}${extension}`);
    }
    return undefined;
  };
  const label = (dir: string): string => relativeSpecifier(fileDir, dir);

  const componentFile = (tagName: string, usings: string[] = []): string | undefined => {
    for (const dir of enclosing) {
      const file = inDir(dir, tagName, [".tsazor"]);
      if (file) return file;
    }
    return usingDirsFor(usings).map((dir) => inDir(dir, tagName, [".tsazor"])).find((file) => file !== undefined);
  };

  const context: FileContext = {
    filePath: resolved,
    fileDir,
    className: classNameForFile(resolved),
    chain,
    inheritedImports: inheritedImports(fileDir, chain),
    inheritedAuthorization: inheritedAuthorization(fileDir, chain),
    resolveComponent: (tagName, usings) => {
      // Enclosing namespaces: the nearest directory wins outright.
      for (const dir of enclosing) {
        const file = inDir(dir, tagName, [".tsazor"]);
        if (file) return { specifier: relativeSpecifier(fileDir, file) };
      }
      // @using sources: every match counts, more than one is ambiguous.
      const matches: Array<ResolvedComponent & { source: string }> = [];
      for (const dir of usingDirsFor(usings)) {
        const file = inDir(dir, tagName, [".tsazor"]);
        if (file) matches.push({ specifier: relativeSpecifier(fileDir, file), source: label(dir) });
      }
      // Runtime built-ins (Blazor's Web namespace via _Imports).
      if (RUNTIME_COMPONENTS.has(tagName)) matches.push({ specifier: RUNTIME_PACKAGE, exportName: tagName, source: RUNTIME_PACKAGE });
      for (const name of packagesFor(usings)) {
        if (name === RUNTIME_PACKAGE && RUNTIME_COMPONENTS.has(tagName)) continue;
        if (packageExports(name, fileDir)?.get(tagName) === true) {
          matches.push({ specifier: name, exportName: tagName, source: name });
        }
      }
      if (matches.length === 0) return null;
      const [first] = matches;
      const result: ResolvedComponent = { specifier: first!.specifier };
      if (first!.exportName) result.exportName = first!.exportName;
      if (matches.length > 1) result.ambiguous = matches.map((match) => match.source);
      return result;
    },
    resolveType: (name, usings) => {
      // A file named after the type: import it the way it really exports it.
      const dirs = [...enclosing, ...usingDirsFor(usings)];
      for (const dir of dirs) {
        const file = inDir(dir, name, [".ts", ".tsazor"]);
        if (!file) continue;
        const kind = importKindOf(file, name);
        if (kind === "named") return { specifier: relativeSpecifier(fileDir, file), exportName: name };
        if (kind === "default") return { specifier: relativeSpecifier(fileDir, file) };
      }
      // Named export of any .ts module in the candidate dirs (Blazor: folders
      // are namespaces; here a barrel like `models.ts` exporting `Address`).
      const exportedFrom = findExportedFrom(dirs, name);
      if (exportedFrom) return { specifier: relativeSpecifier(fileDir, exportedFrom), exportName: name };
      // JS globals (Math, Date, …) and TS utility types (Record, Pick, …)
      // already exist in scope. Local files/exports above may still shadow a
      // global intentionally.
      if (isJsGlobal(name)) return null;
      if (RUNTIME_TYPES.has(name)) return { specifier: RUNTIME_PACKAGE, exportName: name };
      // Bare-package usings: only names the package really exports.
      for (const pkg of packagesFor(usings)) {
        if (packageExports(pkg, fileDir)?.has(name)) return { specifier: pkg, exportName: name };
      }
      return null;
    },
    resolveComponentMetadata: (tagName, usings, imports) => componentMetadataForTag(context, tagName, usings, imports),
    resolveUsing: (value) => checkUsing(value, fileDir),
    componentFile,
    resolveLayout: (layoutName) => componentFile(layoutName),
  };
  return context;
}

/**
 * The resolution part of the compile options for one file — shared by the
 * Vite plugin, the library builds and the language server so all of them
 * compile a .tsazor file identically.
 */
export function resolutionOptions(context: FileContext): Pick<
  CompileOptions,
  "className" | "fileName" | "resolveComponent" | "resolveComponentMetadata" | "resolveType" | "resolveUsing" | "inheritedImports" | "inheritedAuthorization"
> {
  return {
    className: context.className,
    fileName: context.filePath,
    resolveComponent: (tagName, usings) => context.resolveComponent(tagName, usings),
    resolveComponentMetadata: (tagName, usings, imports) => context.resolveComponentMetadata(tagName, usings, imports),
    resolveType: (name, usings) => context.resolveType(name, usings),
    resolveUsing: (value) => context.resolveUsing(value),
    inheritedImports: context.inheritedImports,
    inheritedAuthorization: context.inheritedAuthorization,
  };
}

/** First .ts file in `dirs` that exports `name` by name; declaration files (.d.ts) are skipped. */
function findExportedFrom(dirs: readonly string[], name: string): string | undefined {
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
      if (exportsOfFile(candidate)?.names.has(name)) return candidate;
    }
  }
  return undefined;
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
