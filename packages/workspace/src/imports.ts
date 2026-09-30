import { compile } from "@tsazor/compiler";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** One _Imports.tsazor contribution, already resolved against its own directory. */
export interface ImportsLayer {
  /** Directory containing this _Imports.tsazor. */
  dir: string;
  /** Raw @using values from the file, in order. */
  usings: string[];
  /** @layout from the file, if any. */
  layout?: string;
}

export interface ImportsChain {
  /** Layers ordered nearest-to-file first. */
  layers: ImportsLayer[];
  /** All @using values, nearest wins, deduplicated. */
  usings: string[];
  /** Default layout from the nearest _Imports that declares one. */
  layout?: string;
}

const IMPORTS_FILE = "_Imports.tsazor";

/** True for specifiers that point into the file tree (`./Shared`, `../X`, `Shared/Form`). */
function isPathLike(using: string): boolean {
  const value = using.replace(/^['"]|['"]$/g, "");
  if (value.startsWith("@")) return false; // scoped npm package
  return value.startsWith(".") || value.startsWith("/") || /[\\/]/.test(value);
}

/** Reads _Imports.tsazor files from `dir` up to `root` (nearest first). */
export async function collectImports(fileDir: string, root: string): Promise<ImportsChain> {
  const layers: ImportsLayer[] = [];
  let current = path.resolve(fileDir);
  const stop = path.resolve(root);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const importsPath = path.join(current, IMPORTS_FILE);
    if (existsSync(importsPath)) {
      const source = await readFile(importsPath, "utf8");
      // _Imports.tsazor is directive-only; compile() gives us the parsed values.
      const result = compile(source, { className: "_Imports", fileName: importsPath, generateSourceMap: false });
      layers.push({
        dir: current,
        usings: result.metadata.usings,
        layout: result.metadata.layout,
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
  return { layers, usings, layout };
}

/**
 * Directories a tag/type may resolve against, in priority order: the file's
 * own directory first, then each _Imports layer's directory (siblings are
 * visible, like Blazor), then every @using path directory from the chain.
 */
export function candidateDirs(fileDir: string, chain: ImportsChain): string[] {
  const dirs = [path.resolve(fileDir)];
  for (const layer of chain.layers) {
    if (!dirsInclude(dirs, layer.dir)) dirs.push(path.resolve(layer.dir));
    for (const using of layer.usings) {
      if (!isPathLike(using)) continue;
      const value = using.replace(/^['"]|['"]$/g, "");
      const resolved = path.isAbsolute(value) ? value : path.resolve(layer.dir, value);
      if (!dirsInclude(dirs, resolved)) dirs.push(resolved);
    }
  }
  return dirs;
}

function dirsInclude(dirs: string[], candidate: string): boolean {
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