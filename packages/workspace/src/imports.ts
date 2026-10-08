import { compile, type ImportInfo, type TszDiagnostic } from "@tsazor/compiler";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** One _Imports.tsazor contribution, already resolved against its own directory. */
export interface ImportsLayer {
  /** Directory containing this _Imports.tsazor. */
  dir: string;
  /** Absolute path of the _Imports.tsazor file. */
  file: string;
  /** Raw @using values from the file, in order. */
  usings: string[];
  /** Parsed @import directives, specifiers as written (relative to `dir`). */
  imports: ImportInfo[];
  /** @layout from the file, if any. */
  layout?: string;
  /** Diagnostics of the _Imports file itself (invalid @import, missing @using dir, …). */
  diagnostics: readonly TszDiagnostic[];
}

export interface ImportsChain {
  /** Layers ordered nearest-to-file first. */
  layers: ImportsLayer[];
  /** All @using values, nearest wins, deduplicated. */
  usings: string[];
  /** Default layout from the nearest _Imports that declares one. */
  layout?: string;
  /** The project root the chain was collected up to: the outermost enclosing namespace. */
  root?: string;
}

const IMPORTS_FILE = "_Imports.tsazor";

/** True for specifiers that point into the file tree (`./Shared`, `../X`, `Shared/Form`). */
export function isPathLikeUsing(using: string): boolean {
  const value = stripQuotes(using);
  if (value.startsWith("@")) return false; // scoped npm package
  return value.startsWith(".") || value.startsWith("/") || /[\\/]/.test(value);
}

export function stripQuotes(value: string): string {
  return value.replace(/^['"]|['"]$/g, "");
}

/** Reads _Imports.tsazor files from `dir` up to `root` (nearest first). */
export async function collectImports(fileDir: string, root: string): Promise<ImportsChain> {
  return collectImportsSync(fileDir, root);
}

/** collectImports for synchronous callers (metadata resolution inside a compile). */
export function collectImportsSync(fileDir: string, root: string): ImportsChain {
  const layers: ImportsLayer[] = [];
  let current = path.resolve(fileDir);
  const stop = path.resolve(root);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const importsPath = path.join(current, IMPORTS_FILE);
    if (existsSync(importsPath)) {
      const source = readFileSync(importsPath, "utf8");
      const dir = current;
      // _Imports.tsazor is directive-only; compile() gives us the parsed values
      // (and diagnoses invalid @import forms / missing @using directories).
      const result = compile(source, {
        className: "_Imports",
        fileName: importsPath,
        generateSourceMap: false,
        resolveUsing: (value) => checkUsing(value, dir),
      });
      // @authorize is per page (route metadata), never inherited — said
      // instead of dropped silently; a page is anonymous unless it declares one.
      const authorizeAt = result.metadata.authorize ? /^[ \t]*@authorize\b/m.exec(source) : null;
      const authorizeLine = authorizeAt ? source.slice(0, authorizeAt.index).split("\n").length : 0;
      const authorizeColumn = authorizeAt ? authorizeAt[0].indexOf("@") : 0;
      const inheritance: TszDiagnostic[] = authorizeAt
        ? [{
            code: "TZS014",
            severity: "warning",
            message: "Ignored directive or clause. @authorize in _Imports.tsazor is not inherited — declare it on each page that requires it.",
            pos: { line: authorizeLine, column: authorizeColumn },
            endPos: { line: authorizeLine, column: authorizeColumn + "@authorize".length },
          }]
        : [];
      layers.push({
        dir,
        file: importsPath,
        usings: result.metadata.usings,
        imports: result.metadata.imports,
        layout: result.metadata.layout,
        diagnostics: [...result.diagnostics.all, ...inheritance],
      });
    }
    if (current === stop || !current.startsWith(stop)) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const usings: string[] = [];
  let layout: string | undefined;
  for (const layer of layers) {
    for (const value of layer.usings) {
      if (!usings.includes(value)) usings.push(value);
    }
    if (layout === undefined && layer.layout !== undefined) {
      layout = layer.layout;
    }
  }
  return { layers, usings, layout, root: stop };
}

/**
 * The chain's @import directives as seen from a file in `fileDir`, nearest
 * layer first. Relative specifiers are written relative to their _Imports
 * file and are rebased here (`@import { fmt } from "./util"` in src/ becomes
 * `"../util"` for src/Pages/X.tsazor); bare and absolute ones pass through.
 */
export function inheritedImports(fileDir: string, chain: ImportsChain): ImportInfo[] {
  const imports: ImportInfo[] = [];
  for (const layer of chain.layers) {
    for (const info of layer.imports) {
      imports.push({ ...info, specifier: rebaseSpecifier(info.specifier, layer.dir, fileDir) });
    }
  }
  return imports;
}

/** Rewrites a `./`/`../` specifier written in `fromDir` so it resolves the same from `toDir`. */
export function rebaseSpecifier(specifier: string, fromDir: string, toDir: string): string {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) return specifier;
  if (path.resolve(fromDir) === path.resolve(toDir)) return specifier;
  const relative = path.relative(path.resolve(toDir), path.resolve(fromDir, specifier)).replace(/\\/g, "/");
  return relative.startsWith("../") ? relative : `./${relative}`;
}

/**
 * Checks one @using value written in `dir`: a path-like using must name an
 * existing directory, a bare one an installed package. Returns the TZS018
 * warning message, or null.
 */
export function checkUsing(using: string, dir: string): string | null {
  const value = stripQuotes(using);
  if (isPathLikeUsing(using)) {
    const resolved = path.isAbsolute(value) ? value : path.resolve(dir, value);
    if (isDirectory(resolved)) return null;
    return `'@using ${value}': directory '${resolved}' does not exist — no components or types resolve through it.`;
  }
  if (findPackageDir(value, dir)) return null;
  return `'@using ${value}': package '${value}' is not installed (no node_modules/${value}/package.json above '${dir}').`;
}

/** Nearest `node_modules/<name>` directory above `fromDir`. */
export function findPackageDir(name: string, fromDir: string): string | undefined {
  let current = path.resolve(fromDir);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = path.join(current, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Directories a tag/type may resolve against, in priority order: the file's
 * own directory first, then each _Imports layer's directory (siblings are
 * visible, like Blazor), then every @using path directory from the chain.
 */
export function candidateDirs(fileDir: string, chain: ImportsChain): string[] {
  const dirs = enclosingDirs(fileDir, chain);
  for (const dir of usingDirs(chain)) {
    if (!dirsInclude(dirs, dir)) dirs.push(dir);
  }
  return dirs;
}

/** The file's own directory, every directory above it up to the project root, and every _Imports layer directory (Blazor: enclosing namespaces), nearest first. */
export function enclosingDirs(fileDir: string, chain: ImportsChain): string[] {
  const dirs = [path.resolve(fileDir)];
  // C#'s enclosing namespaces: every directory above the file up to the project root, whether or not it
  // has an _Imports (a component in Admin/ is in scope in Admin/Fields/, as in Razor).
  const root = chain.root === undefined ? undefined : path.resolve(chain.root);
  if (root !== undefined && isInside(dirs[0]!, root)) {
    for (let current = dirs[0]!; !samePath(current, root); ) {
      const parent = path.dirname(current);
      if (parent === current) break;
      dirs.push(parent);
      current = parent;
    }
  }
  for (const layer of chain.layers) {
    if (!dirsInclude(dirs, layer.dir)) dirs.push(path.resolve(layer.dir));
  }
  return dirs;
}

/** Directories named by path-like @using values of the chain, nearest layer first. */
export function usingDirs(chain: ImportsChain): string[] {
  const dirs: string[] = [];
  for (const layer of chain.layers) {
    for (const using of layer.usings) {
      if (!isPathLikeUsing(using)) continue;
      const value = stripQuotes(using);
      const resolved = path.isAbsolute(value) ? value : path.resolve(layer.dir, value);
      if (!dirsInclude(dirs, resolved)) dirs.push(resolved);
    }
  }
  return dirs;
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** `dir` is `root` or below it. */
function isInside(dir: string, root: string): boolean {
  const relative = path.relative(root, dir);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function dirsInclude(dirs: string[], candidate: string): boolean {
  const normalized = path.resolve(candidate).toLowerCase();
  return dirs.some((dir) => path.resolve(dir).toLowerCase() === normalized);
}

/** Module specifier to import from a file at `fromDir` into `target`. */
export function relativeSpecifier(fromDir: string, target: string): string {
  const relative = path.relative(path.resolve(fromDir), path.resolve(target)).replace(/\\/g, "/");
  const prefixed = relative.startsWith(".") ? relative : `./${relative}`;
  if (prefixed.endsWith(".ts")) return prefixed.slice(0, -3);
  return prefixed;
}
