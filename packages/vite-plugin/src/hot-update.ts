/**
 * 4.1 — the HMR handler behind `hotUpdate` (Vite ≥ 6) and the compat hook
 *  `handleHotUpdate` (Vite 5): turns a file watch event into a real module
 *  update using the A3/2.1 dependency graph (`planInvalidation`) beyond Vite's
 *  import-edge propagation.
 */
import { compile, type CodegenResult } from "@tsazor/compiler";
import path from "node:path";
import type { ViteDevServer } from "vite";
import { normalizeFileKey, planInvalidation, type TransformRegistry } from "./invalidate.js";
import { listTsazorFilesUnder, toRootRelativeSpecifier } from "./routes.js";
import { collectImports, createFileContext, defaultMetadataCache, resolutionOptions } from "@tsazor/workspace";

/** Minimum shape shared by Vite 5's ModuleNode and Vite 6+ EnvironmentModuleNode. */
export interface HotModuleNode {
  file?: string | null;
  id?: string | null;
}

export interface TsazorHotUpdateOptions {
  /** The watch event Vite reports (change/add/unlink). */
  event: "update" | "create" | "delete";
  file: string;
  /** Reads the changed file (Vite hands us the fresh disk state). */
  read: () => string | Promise<string>;
  server: ViteDevServer;
  registry: TransformRegistry;
  projectRoot: string;
}

/** Compiles a .tsazor just for its metadata/routes/unresolved tags (no sourcemap). */
async function compileMetadata(file: string, projectRoot: string, source: string): Promise<CodegenResult["metadata"]> {
  const chain = await collectImports(path.dirname(file), projectRoot);
  const context = createFileContext(file, chain);
  const result = compile(source, {
    ...resolutionOptions(context),
    fileName: file,
    generateSourceMap: false,
  });
  return result.metadata;
}

function moduleKey(server: ViteDevServer, module: HotModuleNode): string {
  // Module nodes of the changed file itself come back from the hook's default
  // module list; ours are addressed by file (url resolution is Windows-safe:
  // the fs below is case-insensitive).
  return module.file !== null && module.file !== undefined
    ? normalizeFileKey(module.file)
    : module.id ?? "";
}

/**
 * Runs the invalidation for one watch event and maps the planned files onto
 * Vite's module graph (re-transform = refetch with fresh transform output).
 * Returns the full module list Vite should update — undefined to keep Vite's
 * own propagation when the plan adds nothing. The node types line up with
 * both hook shapes (Vite 5 ModuleNode, Vite 6+ EnvironmentModuleNode).
 */
export async function tsazorHotUpdate(
  options: TsazorHotUpdateOptions,
  defaultModules: ReadonlyArray<HotModuleNode> = [],
): Promise<unknown[] | undefined> {
  const { event, file, read, server } = options;
  const isTsazor = file.toLowerCase().endsWith(".tsazor");
  let metadata: CodegenResult["metadata"] | undefined;
  if (isTsazor && event !== "delete") {
    try {
      metadata = await compileMetadata(file, options.projectRoot, await read());
    } catch {
      metadata = undefined;
    }
  }

  // 2.1 cache: reverse edges must be read before the entries are dropped.
  const dependents = defaultMetadataCache.dependentsOf(file);
  defaultMetadataCache.invalidate(file);

  const plan = await planInvalidation({
    file,
    event,
    metadata,
    registry: options.registry,
    dependentsOf: () => dependents,
    listTsazorUnder: (dir) => listTsazorFilesUnder(dir),
  });

  if (!plan.retransform.length && !plan.routesModule && !plan.fullReload && defaultModules.length === 0) {
    return undefined;
  }

  // Map onto module nodes: Vite invalidates and refetches every returned
  // module (re-running our transform) and propagates from there — the
  // routes module chain reaches index.html and reloads the page. The client
  // environment's graph is authoritative (Vite ≥ 6 invalidates only its
  // EnvironmentModuleNodes; the legacy compat graph returns wrapper nodes
  // that throw on invalidation).
  const clientEnv = server.environments?.client;
  const moduleGraph = clientEnv?.moduleGraph ?? server.moduleGraph;
  const nodes = new Map<string, HotModuleNode>();
  const add = (module: HotModuleNode | undefined | null): void => {
    if (!module) return;
    const key = moduleKey(server, module);
    if (key !== "") nodes.set(key, module);
  };
  for (const url of plan.retransform.map((target) => toRootRelativeSpecifier(server.config.root, target))) {
    add(await moduleGraph.getModuleByUrl(url));
  }
  if (plan.routesModule) {
    add(moduleGraph.getModuleById("\0virtual:tsazor-routes"));
  }
  for (const module of defaultModules) add(module);

  if (plan.fullReload) sendFullReload(server);

  return nodes.size > 0 ? [...nodes.values()] : undefined;
}

/**
 * Removing a `.tsazor.css` sidecar cannot be undone in the live page: the
 * previously injected `<style>` tag survives (its module vanishes, but nothing
 * ever unmounts it) — Vite gets an explicit full-reload instead of an HMR lie.
 */
function sendFullReload(server: ViteDevServer): void {
  const channel = server as unknown as {
    hot?: { send(payload: unknown): void };
    ws?: { send(payload: unknown): void };
  };
  if (channel.hot) channel.hot.send({ type: "full-reload" });
  else if (channel.ws) channel.ws.send({ type: "full-reload" });
}