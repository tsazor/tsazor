import { compile } from "@tsazor/compiler";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { collectImports, createFileContext, classNameForFile } from "@tsazor/workspace";

/** One scanned @page component. */
export interface ScannedRoute {
  template: string;
  /** Absolute path of the page's .tsazor file. */
  componentPath: string;
  /** Absolute path of the layout .tsazor, when the page (or _Imports) sets one. */
  layoutPath?: string;
  /** @authorize, its own or inherited from the _Imports chain → protected route ({} → auth suffices). */
  authorize?: boolean;
  /** Roles/policy of `[Authorize(Roles = "…", Policy = "…")]` — the route's AuthorizationRequirements. */
  authorizeRequirements?: { roles?: string[]; policy?: string };
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".vscode", ".claude"]);

async function* walkTsazorFiles(dir: string, root: string): AsyncGenerator<string> {
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
      yield* walkTsazorFiles(full, root);
    } else if (entry.isFile() && entry.name.endsWith(".tsazor") && entry.name !== "_Imports.tsazor") {
      yield full;
    }
  }
}

/**
 * The directory a scan bounds itself to (4.1): `<root>/src` when it exists —
 * sources live there in every repo app — so tests, scripts and tooling files
 * outside never enter the route manifest or the warmup. Without a `src` the
 * project root itself is the bound.
 */
export function scanRootOf(root: string): string {
  const srcDir = path.join(path.resolve(root), "src");
  return existsSync(srcDir) ? srcDir : path.resolve(root);
}

/** All .tsazor component files under `dir` (excluding _Imports), absolute. */
export async function listTsazorFilesUnder(dir: string): Promise<string[]> {
  const result: string[] = [];
  for await (const filePath of walkTsazorFiles(path.resolve(dir), path.resolve(dir))) {
    result.push(filePath);
  }
  return result;
}

/** Scans the project for @page components and their layouts (bounded by scanRootOf). */
export async function scanRoutes(root: string): Promise<ScannedRoute[]> {
  const routes: ScannedRoute[] = [];
  for await (const filePath of walkTsazorFiles(scanRootOf(root), path.resolve(root))) {
    const source = await readFile(filePath, "utf8");
    if (!/@page\b/.test(source)) continue;
    const className = classNameForFile(filePath);
    const chain = await collectImports(path.dirname(filePath), root);
    const context = createFileContext(filePath, chain);
    // The chain's @authorize / @allowAnonymous merge into the page's requirements (B12).
    const result = compile(source, { className, fileName: filePath, generateSourceMap: false, inheritedAuthorization: context.inheritedAuthorization });
    if (!result.metadata.routeTemplate) continue;
    let layoutPath: string | undefined;
    if (result.metadata.layout) {
      layoutPath = context.resolveLayout(result.metadata.layout);
    } else if (chain.layout) {
      layoutPath = context.resolveLayout(chain.layout);
    }
    // Several @page directives: one route per template (Blazor semantics).
    for (const template of result.metadata.routeTemplates) {
      routes.push({
        template,
        componentPath: filePath,
        layoutPath,
        authorize: result.metadata.authorize === true,
        authorizeRequirements: result.metadata.authorizeData,
      });
    }
  }
  return routes;
}

/**
 * Root-relative dev-module URLs of all .tsazor components (pages + plain
 * components) — the input for dev-server warmup, so compile errors inside
 * verbatim @code surface at startup instead of on the first page visit.
 * Bounded by scanRootOf (4.1).
 */
export async function scanTsazorModules(root: string): Promise<string[]> {
  const urls: string[] = [];
  for await (const filePath of walkTsazorFiles(scanRootOf(root), path.resolve(root))) {
    urls.push(toRootRelativeSpecifier(root, filePath));
  }
  return urls;
}

/** Generates the `virtual:tsazor-routes` module content (RouteEntry[] literal). */
export function generateRoutesModule(root: string, routes: ScannedRoute[], isLazy: (componentPath: string) => boolean = () => false): string {
  const rootPath = path.resolve(root);
  const lines: string[] = [];
  const entries: string[] = [];
  const usedLocals = new Set<string>();
  // A page with several @page templates has several routes but one import (one loader).
  const componentLocals = new Map<string, string>();
  routes.forEach((route, index) => {
    const className = classNameForFile(route.componentPath);
    let local = componentLocals.get(route.componentPath);
    const firstRouteOfComponent = local === undefined;
    const lazy = isLazy(route.componentPath);
    if (local === undefined) {
      local = lazy ? `load${className}` : className;
      let suffix = index;
      while (usedLocals.has(local)) {
        local = `${lazy ? `load${className}` : className}${++suffix}`;
      }
      usedLocals.add(local);
      componentLocals.set(route.componentPath, local);
      const componentSpec = toRootRelativeSpecifier(rootPath, route.componentPath);
      if (lazy) {
        // E5: one chunk per page; its layout loads with it (Vite dedupes a layout eager pages share).
        const layoutSpec = route.layoutPath ? toRootRelativeSpecifier(rootPath, route.layoutPath) : undefined;
        lines.push(
          layoutSpec
            ? `const ${local} = () => Promise.all([import("${componentSpec}"), import("${layoutSpec}")]).then(([page, layout]) => ({ type: page.default, layout: layout.default }));`
            : `const ${local} = () => import("${componentSpec}").then((page) => ({ type: page.default }));`,
        );
      } else {
        lines.push(`import ${local} from "${componentSpec}";`);
      }
    }
    const authorizeSpec = route.authorize ? `, authorize: ${JSON.stringify(route.authorizeRequirements ?? {})}` : "";
    if (lazy) {
      entries.push(`  { template: ${JSON.stringify(route.template)}, load: ${local}${authorizeSpec} },`);
      return;
    }
    const layoutSpec = route.layoutPath ? toRootRelativeSpecifier(rootPath, route.layoutPath) : undefined;
    if (layoutSpec) {
      const layoutLocal = `${local}Layout`;
      if (firstRouteOfComponent) lines.push(`import ${layoutLocal} from "${layoutSpec}";`);
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
 * Root-relative specifier (`/src/Pages/Counter.tsazor`) — the virtual routes
 * module has no real path of its own, so imports resolve against the Vite root.
 */
export function toRootRelativeSpecifier(root: string, target: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(target)).replace(/\\/g, "/");
  return `/${relative}`;
}