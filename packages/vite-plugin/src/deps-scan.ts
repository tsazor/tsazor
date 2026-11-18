/**
 * Vite's dependency scan (esbuild) follows the imports of `index.html` and the app's `.ts` files, but it can't read a
 * `.tsazor` file: a package imported only from a page (`@import { format } from "date-fns"`) was optimized when the
 * first page loaded, and that load could fail with Vite's 504 "Outdated Optimize Dep" — an empty page until a reload.
 * The same holds for a `.ts` file only a page imports (a generated API client). The plugin reads the imports of the
 * project's `.tsazor` and `.ts` files at startup and hands the packages the app depends on to `optimizeDeps.include`,
 * so they are optimized before the first page asks for them.
 */
import { readdirSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

/** Folders the scan never enters. */
const SKIP = new Set(["node_modules", "dist", ".git", ".vite", "coverage"]);
/** The files it reads, and those it leaves out: declarations, tests, configs. */
const SOURCE = /.(tsazor|ts)$/;
const NOT_SOURCE = /.d.ts$|.(test|spec).ts$|.config.ts$/;

/**
 * The bare specifiers (`date-fns`, `sleipnir-client/sse`) the `.tsazor` and `.ts` files below `root` import (not
 * declarations or tests), of the packages in `root/package.json`'s `dependencies` (a dev dependency is no browser code), installed from a registry — a package linked from a workspace (`workspace:`, `file:`)
 * isn't prebundled, as Vite doesn't prebundle a linked one — sorted.
 */
export function tsazorBareImports(root: string): string[] {
  const dependencies = appDependencies(root);
  if (dependencies.size === 0) return [];
  const found = new Set<string>();
  for (const file of tsazorFiles(root)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const specifier of importSpecifiers(text)) {
      const name = packageName(specifier);
      if (name !== undefined && isCode(specifier) && dependencies.has(name) && !isLinked(root, name)) found.add(specifier);
    }
  }
  return [...found].sort();
}

/** The specifiers of a `.tsazor` file's `@import`s and of `import … from`s in its code (type-only ones left out). */
export function importSpecifiers(text: string): string[] {
  const specifiers: string[] = [];
  for (const match of text.matchAll(/^\s*@?import\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/gm)) {
    if (match[1] === undefined) specifiers.push(match[2]!);
  }
  return specifiers;
}

/** The package a bare specifier names (`@scope/pkg/sub` → `@scope/pkg`); undefined for a relative, absolute or virtual one. */
export function packageName(specifier: string): string | undefined {
  if (/^(\.|\/|[a-zA-Z]:|virtual:|node:|\0)/.test(specifier)) return undefined;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? (parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined) : parts[0];
}

/** Whether a specifier names code Vite can prebundle: not a stylesheet, an image or a JSON file (`pkg/x.css`). */
function isCode(specifier: string): boolean {
  const last = specifier.split("/").pop() ?? "";
  const extension = /\.([a-z0-9]+)$/i.exec(last)?.[1]?.toLowerCase();
  return extension === undefined || ["js", "mjs", "cjs"].includes(extension);
}

/** A package linked from outside any node_modules (a workspace package): its real path isn't in one. Not installed: linked. */
function isLinked(root: string, name: string): boolean {
  try {
    const real = realpathSync(path.join(root, "node_modules", name));
    return !real.split(path.sep).includes("node_modules");
  } catch {
    return true;
  }
}

function appDependencies(root: string): Set<string> {
  try {
    const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return new Set(Object.keys(manifest.dependencies ?? {}));
  } catch {
    return new Set();
  }
}

function tsazorFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : tsazorFiles(path.join(dir, entry.name));
    return SOURCE.test(entry.name) && !NOT_SOURCE.test(entry.name) ? [path.join(dir, entry.name)] : [];
  });
}
