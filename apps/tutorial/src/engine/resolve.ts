/**
 * Component/type resolution over an in-memory file set — the browser
 * counterpart of @tsazor/workspace's file-system resolver (which needs
 * node:fs). Same rules, reduced to what a tutorial project has: one flat-ish
 * folder of files, the runtime built-ins and the @tsazor/components package.
 *
 * - A tag resolves to a `.tsazor` file in the file's own folder or the project
 *   root (enclosing folders), then to `@using` sources: runtime built-ins and
 *   bare packages with a manifest (`@using @tsazor/components`).
 * - Parameter metadata comes from the compiler's syntactic extractor
 *   (`extractTsazorMetadata` / `extractModuleMetadata`) over the in-memory
 *   sources, plus the package manifests.
 */
import {
  extractModuleMetadata,
  extractTsazorMetadata,
  parseDocument,
  parseImportDirective,
  resolveComponentMetadata as resolveClassMetadata,
  scanModuleExports,
  DiagnosticBag,
  type CompileOptions,
  type ComponentManifest,
  type ComponentMetadata,
  type ImportInfo,
  type MetadataHost,
  type ModuleMetadata,
  type ResolvedComponent,
  type ResolvedType,
} from "@tsazor/compiler";
import { RUNTIME_COMPONENTS, RUNTIME_MANIFEST, RUNTIME_PACKAGE, RUNTIME_TYPES } from "@tsazor/workspace/builtins";
import componentsManifest from "@tsazor/components/tsazor-components.json";

import type { Files } from "./types.js";

export type { Files };

export const COMPONENTS_PACKAGE = "@tsazor/components";

const PACKAGE_MANIFESTS: Record<string, ComponentManifest> = {
  [RUNTIME_PACKAGE]: RUNTIME_MANIFEST,
  [COMPONENTS_PACKAGE]: componentsManifest as unknown as ComponentManifest,
};

/* Paths -------------------------------------------------------------------- */

export function dirname(file: string): string {
  const index = file.lastIndexOf("/");
  return index < 0 ? "" : file.slice(0, index);
}

export function basename(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}

export function joinPath(dir: string, relative: string): string {
  const parts = dir ? dir.split("/") : [];
  for (const segment of relative.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

/** `./X.tsazor` style specifier from `fromDir` to `target` (both project-relative). */
export function relativeSpecifier(fromDir: string, target: string): string {
  const from = fromDir ? fromDir.split("/") : [];
  const to = target.split("/");
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const up = from.length - common;
  const rest = to.slice(common).join("/");
  return up === 0 ? `./${rest}` : `${"../".repeat(up)}${rest}`;
}

const MODULE_EXTENSIONS = ["", ".ts", ".tsazor", "/index.ts"];

/** Resolves a relative import specifier against the file set. */
export function resolveModuleFile(files: Files, specifier: string, fromFile: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = joinPath(dirname(fromFile), specifier);
  for (const extension of MODULE_EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (candidate in files) return candidate;
  }
  // `./data.js` written for a `data.ts` (TS convention).
  if (base.endsWith(".js") && `${base.slice(0, -3)}.ts` in files) return `${base.slice(0, -3)}.ts`;
  return undefined;
}

/** Class name of a .tsazor file (Blazor: file name = type name). */
export function classNameForFile(file: string): string {
  const base = basename(file).replace(/\.[^.]+$/, "");
  const sanitized = base.replace(/[^A-Za-z0-9_$]/g, "_");
  return /^[A-Za-z_$]/.test(sanitized) ? sanitized : `_${sanitized}`;
}

/* _Imports chain ------------------------------------------------------------- */

interface ImportsLayer {
  file: string;
  dir: string;
  imports: ImportInfo[];
  usings: string[];
}

/** The `_Imports.tsazor` files above `file` (nearest first). */
function importsChain(files: Files, file: string): ImportsLayer[] {
  const layers: ImportsLayer[] = [];
  let dir = dirname(file);
  for (;;) {
    const candidate = dir ? `${dir}/_Imports.tsazor` : "_Imports.tsazor";
    if (candidate in files && candidate !== file) {
      const document = parseDocument(files[candidate]!, new DiagnosticBag());
      const layer: ImportsLayer = { file: candidate, dir, imports: [], usings: [] };
      for (const directive of document.directives) {
        if (directive.name === "import") {
          const parsed = parseImportDirective(directive.value);
          if (parsed.ok) layer.imports.push(parsed.info);
        } else if (directive.name === "using") layer.usings.push(directive.value.trim());
      }
      layers.push(layer);
    }
    if (!dir) break;
    dir = dirname(dir);
  }
  return layers;
}

const stripQuotes = (value: string): string => value.replace(/^["']|["']$/g, "");
const isPathLike = (using: string): boolean => /^["']?\.{1,2}\//.test(using);

/* Context ------------------------------------------------------------------------ */

export interface ProjectResolver {
  /** The resolution part of the compile options for one file. */
  optionsFor(file: string): Pick<
    CompileOptions,
    "className" | "fileName" | "resolveComponent" | "resolveComponentMetadata" | "resolveType" | "resolveUsing" | "inheritedImports"
  >;
}

export function createResolver(files: Files): ProjectResolver {
  const moduleCache = new Map<string, ModuleMetadata | undefined>();

  const host: MetadataHost = {
    resolveModule: (specifier, fromFile) => {
      const target = resolveModuleFile(files, specifier, fromFile);
      return target ? host.moduleAt(target) : undefined;
    },
    moduleAt: (file) => {
      if (moduleCache.has(file)) return moduleCache.get(file);
      const source = files[file];
      let module: ModuleMetadata | undefined;
      if (source !== undefined) {
        if (file.endsWith(".tsazor")) {
          module = extractTsazorMetadata(source, file, {
            className: classNameForFile(file),
            inheritedImports: inheritedImportsFor(file),
            codeBehind: `${file}.ts` in files,
          });
        } else if (file.endsWith(".ts")) {
          module = extractModuleMetadata(source, file);
        }
      }
      moduleCache.set(file, module);
      return module;
    },
    packageComponent: (specifier, exportName) => PACKAGE_MANIFESTS[specifier]?.components[exportName],
  };

  const componentOfFile = (file: string, exportName?: string): ComponentMetadata | undefined => {
    const module = host.moduleAt(file);
    const local = module?.exports.get(exportName ?? "default");
    return module && local !== undefined ? resolveClassMetadata(module, local, host) : undefined;
  };

  /** The chain's @imports rebased to `file` (nearest layer first). */
  function inheritedImportsFor(file: string): ImportInfo[] {
    const fileDir = dirname(file);
    return importsChain(files, file).flatMap((layer) =>
      layer.imports.map((info) =>
        info.specifier.startsWith(".")
          ? { ...info, specifier: relativeSpecifier(fileDir, joinPath(layer.dir, info.specifier)) }
          : info,
      ),
    );
  }

  return {
    optionsFor(file) {
      const fileDir = dirname(file);
      const chain = importsChain(files, file);
      const enclosing = [fileDir, ...chain.map((layer) => layer.dir)].filter((dir, index, all) => all.indexOf(dir) === index);
      if (!enclosing.includes("")) enclosing.push("");
      const allUsings = (usings: readonly string[]): string[] => [...usings, ...chain.flatMap((layer) => layer.usings)];
      const usingDirs = (usings: readonly string[]): string[] =>
        allUsings(usings)
          .filter(isPathLike)
          .map((using) => joinPath(fileDir, stripQuotes(using)))
          .filter((dir) => !enclosing.includes(dir));
      const packages = (usings: readonly string[]): string[] =>
        [...new Set(allUsings(usings).filter((using) => !isPathLike(using)).map(stripQuotes))];
      const inDir = (dir: string, name: string, extension: string): string | undefined => {
        const candidate = dir ? `${dir}/${name}${extension}` : `${name}${extension}`;
        return candidate in files ? candidate : undefined;
      };

      const resolveComponent = (tagName: string, usings: string[]): ResolvedComponent | null => {
        for (const dir of enclosing) {
          const hit = inDir(dir, tagName, ".tsazor");
          if (hit && hit !== file) return { specifier: relativeSpecifier(fileDir, hit) };
        }
        const matches: Array<ResolvedComponent & { source: string }> = [];
        for (const dir of usingDirs(usings)) {
          const hit = inDir(dir, tagName, ".tsazor");
          if (hit) matches.push({ specifier: relativeSpecifier(fileDir, hit), source: dir });
        }
        if (RUNTIME_COMPONENTS.has(tagName)) matches.push({ specifier: RUNTIME_PACKAGE, exportName: tagName, source: RUNTIME_PACKAGE });
        for (const name of packages(usings)) {
          if (name === RUNTIME_PACKAGE) continue;
          const component = PACKAGE_MANIFESTS[name]?.components[tagName];
          if (component && !component.abstract) matches.push({ specifier: name, exportName: tagName, source: name });
        }
        if (matches.length === 0) return null;
        const [first] = matches;
        const result: ResolvedComponent = { specifier: first!.specifier };
        if (first!.exportName) result.exportName = first!.exportName;
        if (matches.length > 1) result.ambiguous = matches.map((match) => match.source);
        return result;
      };

      const inherited = inheritedImportsFor(file);

      const resolveComponentMetadata = (tagName: string, usings: string[], imports: readonly ImportInfo[] = []): ComponentMetadata | null => {
        for (const info of [...imports, ...inherited]) {
          const binding = info.bindings.find((candidate) => candidate.local === tagName && !candidate.typeOnly);
          if (!binding || binding.imported === "*") continue;
          if (!info.specifier.startsWith(".")) return host.packageComponent(info.specifier, binding.imported, file) ?? null;
          const target = resolveModuleFile(files, info.specifier, file);
          if (!target) return null;
          return componentOfFile(target, target.endsWith(".tsazor") || binding.imported === "default" ? undefined : binding.imported) ?? null;
        }
        const resolved = resolveComponent(tagName, usings);
        if (!resolved) return null;
        if (resolved.exportName) return host.packageComponent(resolved.specifier, resolved.exportName, file) ?? null;
        const target = resolveModuleFile(files, resolved.specifier, file);
        return target ? componentOfFile(target) ?? null : null;
      };

      const resolveType = (name: string, usings: string[]): ResolvedType | null => {
        for (const dir of [...enclosing, ...usingDirs(usings)]) {
          for (const extension of [".ts", ".tsazor"]) {
            const hit = inDir(dir, name, extension);
            if (!hit) continue;
            if (extension === ".tsazor") return { specifier: relativeSpecifier(fileDir, hit) };
            const exports = scanModuleExports(files[hit]!, hit);
            if (exports.names.has(name)) return { specifier: relativeSpecifier(fileDir, hit), exportName: name };
            if (exports.hasDefault) return { specifier: relativeSpecifier(fileDir, hit) };
          }
        }
        if (name in globalThis) return null;
        if (RUNTIME_TYPES.has(name)) return { specifier: RUNTIME_PACKAGE, exportName: name };
        return null;
      };

      const resolveUsing = (value: string): string | null => {
        if (isPathLike(value)) {
          const dir = joinPath(fileDir, stripQuotes(value));
          const prefix = dir ? `${dir}/` : "";
          return Object.keys(files).some((path) => path.startsWith(prefix)) ? null : `The folder '${stripQuotes(value)}' does not exist.`;
        }
        const name = stripQuotes(value);
        return name in PACKAGE_MANIFESTS ? null : `The package '${name}' is not available in the tutorial.`;
      };

      return {
        className: classNameForFile(file),
        fileName: file,
        resolveComponent,
        resolveComponentMetadata,
        resolveType,
        resolveUsing,
        inheritedImports: inherited,
      };
    },
  };
}
