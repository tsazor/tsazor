import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * tsconfig `compilerOptions.paths` for the metadata host: an app's own alias (`@/components/ui/Button.tsazor`,
 * `@/api/users` — the `@/*` that shadcn and Vite's React template set up) is a module of the app, not a package.
 * TypeScript's rules: the nearest tsconfig.json above the importing file (its `extends` chain for the options it
 * leaves out); a pattern is exact or has one `*`; the longest matching prefix wins; the targets are relative to
 * `baseUrl`, or to the tsconfig that declares `paths` when there is none. The bundler resolves the same alias at
 * build time (Vite's `resolve.alias`), so the app keeps one spelling.
 */

interface PathMap {
  /** The directory the targets are relative to. */
  readonly base: string;
  readonly paths: ReadonlyArray<readonly [pattern: string, targets: readonly string[]]>;
}

interface TsconfigOptions {
  baseUrl?: string;
  paths?: Record<string, string[]>;
  /** Directories the two were declared in (an extended tsconfig's own). */
  baseUrlDir?: string;
  pathsDir?: string;
}

const tsconfigs = new Map<string, { stamp: string; options: TsconfigOptions | undefined }>();
const nearest = new Map<string, string>();

function stampOf(file: string): string {
  try {
    const stat = statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

/** JSON with comments and trailing commas, as tsconfig allows. */
export function parseJsonc(text: string): unknown {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === "\\") i++;
      out += text.slice(start, i + 1);
    } else if (char === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (char === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i++;
    } else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function readOptions(file: string, seen = new Set<string>()): TsconfigOptions | undefined {
  if (seen.has(file)) return undefined;
  seen.add(file);
  const stamp = stampOf(file);
  const cached = tsconfigs.get(file);
  if (cached && cached.stamp === stamp && seen.size === 1) return cached.options;
  let options: TsconfigOptions | undefined;
  try {
    const json = parseJsonc(readFileSync(file, "utf8")) as { extends?: unknown; compilerOptions?: { baseUrl?: unknown; paths?: unknown } };
    const dir = path.dirname(file);
    const own: TsconfigOptions = {};
    if (typeof json.compilerOptions?.baseUrl === "string") {
      own.baseUrl = json.compilerOptions.baseUrl;
      own.baseUrlDir = dir;
    }
    if (json.compilerOptions?.paths && typeof json.compilerOptions.paths === "object") {
      own.paths = json.compilerOptions.paths as Record<string, string[]>;
      own.pathsDir = dir;
    }
    // A relative `extends` (a package's shared config can't declare the app's own aliases).
    const parent = typeof json.extends === "string" && json.extends.startsWith(".") ? readOptions(path.resolve(dir, json.extends.endsWith(".json") ? json.extends : `${json.extends}.json`), seen) : undefined;
    options = { ...parent, ...own };
  } catch {
    options = undefined;
  }
  if (seen.size === 1) tsconfigs.set(file, { stamp, options });
  return options;
}

/** The nearest tsconfig.json at or above `dir` (a found one is remembered while it exists; none is looked up again). */
function nearestTsconfig(dir: string): string | undefined {
  const cached = nearest.get(dir);
  if (cached && stampOf(cached) !== "missing") return cached;
  let found: string | null = null;
  for (let current = dir; ; ) {
    const candidate = path.join(current, "tsconfig.json");
    if (stampOf(candidate) !== "missing") {
      found = candidate;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current || path.basename(current) === "node_modules") break;
    current = parent;
  }
  if (found) nearest.set(dir, found);
  return found ?? undefined;
}

function pathMapOf(fromFile: string): PathMap | undefined {
  const tsconfig = nearestTsconfig(path.dirname(fromFile));
  if (!tsconfig) return undefined;
  const options = readOptions(tsconfig);
  if (!options?.paths) return undefined;
  const base = options.baseUrl !== undefined ? path.resolve(options.baseUrlDir!, options.baseUrl) : options.pathsDir!;
  return { base, paths: Object.entries(options.paths).filter(([, targets]) => Array.isArray(targets)) };
}

/**
 * The absolute paths a bare specifier maps to under the importing file's tsconfig `paths` (without extensions:
 * the caller tries them), best match first; empty when nothing matches.
 */
export function mapPath(specifier: string, fromFile: string): string[] {
  const map = pathMapOf(fromFile);
  if (!map) return [];
  let best: { prefix: number; targets: readonly string[]; star: string | undefined } | undefined;
  for (const [pattern, targets] of map.paths) {
    const star = pattern.indexOf("*");
    if (star < 0) {
      if (pattern === specifier) return targets.map((target) => path.resolve(map.base, target));
      continue;
    }
    const prefix = pattern.slice(0, star);
    const suffix = pattern.slice(star + 1);
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix) || specifier.length < prefix.length + suffix.length) continue;
    if (best && best.prefix >= prefix.length) continue;
    best = { prefix: prefix.length, targets, star: specifier.slice(prefix.length, specifier.length - suffix.length) };
  }
  if (!best) return [];
  const matched = best.star!;
  return best.targets.map((target) => path.resolve(map.base, target.replace("*", matched)));
}
