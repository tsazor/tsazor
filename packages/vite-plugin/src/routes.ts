import { compile } from "@tasor/compiler";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { collectImports, createFileContext, classNameForFile } from "@tasor/workspace";

/** One scanned @page component. */
export interface ScannedRoute {
  template: string;
  /** Absolute path of the page's .tazor file. */
  componentPath: string;
  /** Absolute path of the layout .tazor, when the page (or _Imports) sets one. */
  layoutPath?: string;
  /** Bare @authorize directive → authentication-required route ({} → auth suffices). */
  authorize?: boolean;
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vscode", ".claude"]);

async function* walkTazorFiles(dir: string, root: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      yield* walkTazorFiles(full, root);
    } else if (entry.isFile() && entry.name.endsWith(".tazor") && entry.name !== "_Imports.tazor") {
      yield full;
    }
  }
}

/** Scans the project for @page components and their layouts. */
export async function scanRoutes(root: string): Promise<ScannedRoute[]> {
  const routes: ScannedRoute[] = [];
  for await (const filePath of walkTazorFiles(path.resolve(root), path.resolve(root))) {
    const source = await readFile(filePath, "utf8");
    if (!/@page\b/.test(source)) continue;
    const className = classNameForFile(filePath);
    const result = compile(source, { className, fileName: filePath, generateSourceMap: false });
    if (!result.metadata.routeTemplate) continue;
    const chain = await collectImports(path.dirname(filePath), root);
    const context = createFileContext(filePath, chain);
    let layoutPath: string | undefined;
    if (result.metadata.layout) {
      layoutPath = context.resolveLayout(result.metadata.layout);
    } else if (chain.layout) {
      layoutPath = context.resolveLayout(chain.layout);
    }
    routes.push({
      template: result.metadata.routeTemplate,
      componentPath: filePath,
      layoutPath,
      authorize: result.metadata.authorize === true,
    });
  }
  return routes;
}

/** Generates the `virtual:tasor-routes` module content (RouteEntry[] literal). */
export function generateRoutesModule(root: string, routes: ScannedRoute[]): string {
  const rootPath = path.resolve(root);
  const lines: string[] = [];
  const entries: string[] = [];
  const usedLocals = new Set<string>();
  routes.forEach((route, index) => {
    const className = classNameForFile(route.componentPath);
    let local = className;
    let suffix = index;
    while (usedLocals.has(local)) {
      local = `${className}${++suffix}`;
    }
    usedLocals.add(local);
    const componentSpec = toRootRelativeSpecifier(rootPath, route.componentPath);
    lines.push(`import ${local} from "${componentSpec}";`);
    const layoutSpec = route.layoutPath ? toRootRelativeSpecifier(rootPath, route.layoutPath) : undefined;
    const authorizeSpec = route.authorize ? ", authorize: {}" : "";
    if (layoutSpec) {
      const layoutLocal = `${local}Layout`;
      lines.push(`import ${layoutLocal} from "${layoutSpec}";`);
      entries.push(`  { template: ${JSON.stringify(route.template)}, type: ${local}, layout: ${layoutLocal}${authorizeSpec} },`);
    } else {
      entries.push(`  { template: ${JSON.stringify(route.template)}, type: ${local}${authorizeSpec} },`);
    }
  });
  lines.push("");
  lines.push("export default [");
  lines.push(...entries);
  lines.push("];");
  lines.push("");
  return lines.join("\n");
}

/**
 * Root-relative specifier (`/src/Pages/Counter.tazor`) — the virtual routes
 * module has no real path of its own, so imports resolve against the Vite root.
 */
function toRootRelativeSpecifier(root: string, target: string): string {
  const relative = path.relative(root, path.resolve(target)).replace(/\\/g, "/");
  return `/${relative}`;
}