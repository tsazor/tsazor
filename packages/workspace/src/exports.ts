import { scanModuleExports, type ModuleExports } from "@tsazor/compiler";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { findPackageDir } from "./imports.js";

/**
 * Export lists read syntactically (TS parser, no checker) — the ground truth
 * for default-vs-named imports of a target file (review I3) and for which
 * names a bare-package `@using` really provides (review I4).
 */

const moduleCache = new Map<string, { mtimeMs: number; exports: ModuleExports }>();

/** Exports of one module file, cached per file+mtime (the resolver runs on every compile). */
export function exportsOfFile(file: string): ModuleExports | undefined {
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch {
    return undefined;
  }
  const cached = moduleCache.get(file);
  if (cached && cached.mtimeMs === mtimeMs) return cached.exports;
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  const exports = scanModuleExports(source, file);
  moduleCache.set(file, { mtimeMs, exports });
  return exports;
}

/** How `name` is importable from a module file: named, default (the file's
 *  default export when no named export matches), or not at all. */
export function importKindOf(file: string, name: string): "named" | "default" | undefined {
  if (file.endsWith(".tsazor")) return "default"; // a .tsazor module's component class is its default export
  const exports = exportsOfFile(file);
  if (!exports) return undefined;
  if (exports.names.has(name) || reexportedNames(file, exports).has(name)) return "named";
  if (exports.hasDefault) return "default";
  return undefined;
}

const MODULE_EXTENSIONS = ["", ".js", ".mjs", ".ts", ".mts", ".d.ts", "/index.js", "/index.mjs", "/index.ts", "/index.d.ts"];

function resolveRelativeModule(fromFile: string, specifier: string): string | undefined {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = MODULE_EXTENSIONS.map((extension) => base + extension);
  // tsc-style `./x.js` specifiers point at `./x.ts` sources.
  if (/\.js$/.test(base)) candidates.push(base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".d.ts"));
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

/** Names contributed by `export * from "./…"` (relative targets only, cycle-safe). */
function reexportedNames(file: string, exports: ModuleExports, seen = new Set<string>()): Map<string, boolean> {
  const names = new Map<string, boolean>();
  seen.add(file);
  for (const specifier of exports.reexportAll) {
    if (!specifier.startsWith(".")) continue;
    const target = resolveRelativeModule(file, specifier);
    if (!target || seen.has(target)) continue;
    const nested = exportsOfFile(target);
    if (!nested) continue;
    for (const [name, value] of nested.names) names.set(name, value);
    for (const [name, value] of reexportedNames(target, nested, seen)) names.set(name, value);
  }
  return names;
}

/* Package export lists --------------------------------------------------------- */

const packageCache = new Map<string, { key: string; names: Map<string, boolean> }>();

/**
 * Named exports of a bare package as installed above `fromDir`: its entry
 * module (package.json `exports["."]` → `module` → `main` → `types`) read
 * syntactically, following relative `export *` re-exports. Undefined when
 * the package is not installed or its entry does not exist (e.g. unbuilt).
 */
export function packageExports(name: string, fromDir: string): ReadonlyMap<string, boolean> | undefined {
  const packageDir = findPackageDir(name, fromDir);
  if (!packageDir) return undefined;
  const entry = packageEntry(packageDir);
  if (!entry) return undefined;
  let key: string;
  try {
    key = `${entry}:${statSync(entry).mtimeMs}`;
  } catch {
    return undefined;
  }
  const cached = packageCache.get(packageDir);
  if (cached && cached.key === key) return cached.names;
  const exports = exportsOfFile(entry);
  if (!exports) return undefined;
  const names = new Map(exports.names);
  for (const [exported, value] of reexportedNames(entry, exports)) if (!names.has(exported)) names.set(exported, value);
  packageCache.set(packageDir, { key, names });
  return names;
}

function packageEntry(packageDir: string): string | undefined {
  let manifest: { exports?: unknown; module?: string; main?: string; types?: string; typings?: string };
  try {
    manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
  const candidates: string[] = [];
  const root = rootExport(manifest.exports);
  if (root) candidates.push(...root);
  for (const field of [manifest.module, manifest.main, manifest.types, manifest.typings]) {
    if (typeof field === "string") candidates.push(field);
  }
  for (const candidate of candidates) {
    const file = path.resolve(packageDir, candidate);
    if (existsSync(file)) return file;
  }
  return undefined;
}

/** Targets of the package's `"."` export, JS conditions first. */
function rootExport(exports: unknown): string[] | undefined {
  if (typeof exports === "string") return [exports];
  if (!exports || typeof exports !== "object") return undefined;
  const map = exports as Record<string, unknown>;
  const dot = "." in map ? map["."] : Object.keys(map).some((key) => key.startsWith(".")) ? undefined : map;
  if (typeof dot === "string") return [dot];
  if (!dot || typeof dot !== "object") return undefined;
  const conditions = dot as Record<string, unknown>;
  return ["import", "module", "default", "require", "types"]
    .map((condition) => conditions[condition])
    .filter((target): target is string => typeof target === "string");
}
