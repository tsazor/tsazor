import { existsSync } from "node:fs";
import path from "node:path";
import { shadowPathFor } from "./shadow-module.js";
import {
  findNearestTsconfig,
  findTsazorFiles,
  pathWithin,
  TsazorTypeService,
  type ShadowEntry,
  type ShadowLookup,
} from "./ts-service.js";

/**
 * Project routing (2.5 — LSP projektweit): every `.tsazor` belongs to the
 * project of the `tsconfig.json` nearest above it, bounded by the workspace
 * folder containing the file — per-app options for each app of a multi-root
 * (or monorepo) workspace instead of one service over `workspaceFolders[0]`.
 *
 * Each project owns one `TsazorTypeService`; cross-project shadow imports
 * (e.g. Rewrite-B targets under another package's tsconfig) are cascaded at
 * the registry level and resolved through a shared lookup, so a consumer's
 * program still sees the foreign shadow's content.
 */

export interface TsazorProject {
  /** Project root: the tsconfig's directory, or the workspace root fallback. */
  readonly root: string;
  /** The resolved tsconfig (undefined → defaults under `root`). */
  readonly configPath?: string;
  /** Workspace folder the file that created this project lives in. */
  readonly workspaceRoot: string;
  readonly service: TsazorTypeService;
}

const toProjectKey = (projectRoot: string, configPath?: string): string =>
  `${projectRoot.replace(/\\/g, "/").toLowerCase()}|${configPath ? path.resolve(configPath).toLowerCase() : ""}`;

/** Case-insensitive key over real file paths (files map, import edges). */
const toFileKey = (file: string): string => path.resolve(file).replace(/\\/g, "/").toLowerCase();

export class ProjectRegistry implements ShadowLookup {
  private readonly projects = new Map<string, TsazorProject>();
  private readonly workspaceRoots: string[];
  /** Known `.tsazor` files (scan + notifications): lowercased key → real path. */
  private readonly files = new Map<string, string>();
  /** `.tsazor` files currently being ensured (cascade cycle guard). */
  private readonly ensuring = new Set<string>();
  private readonly lookup: ShadowLookup = { entryOf: (fileName) => this.findEntry(fileName) };

  constructor(roots: readonly string[]) {
    this.workspaceRoots = roots.map((root) => path.resolve(root));
  }

  /* Routing ------------------------------------------------------------- */

  /** The workspace folder containing `file` (deepest match; first root as the
   *  fallback for URIs no folder declares). */
  folderOf(file: string): string {
    const resolved = path.resolve(file);
    let best: string | undefined;
    for (const root of this.workspaceRoots) {
      if (pathWithin(resolved, root) && (best === undefined || root.length > best.length)) best = root;
    }
    return best ?? this.workspaceRoots[0] ?? path.dirname(resolved);
  }

  /** The project a file belongs to — created (and its tsconfig read) on demand. */
  projectFor(file: string): TsazorProject {
    const workspaceRoot = this.folderOf(file);
    const configPath = findNearestTsconfig(path.dirname(path.resolve(file)), workspaceRoot);
    const root = configPath ? path.dirname(configPath) : workspaceRoot;
    const key = toProjectKey(root, configPath);
    const existing = this.projects.get(key);
    if (existing) return existing;
    const project: TsazorProject = {
      root,
      ...(configPath !== undefined ? { configPath } : {}),
      workspaceRoot,
      service: new TsazorTypeService(root, configPath, this.lookup),
    };
    this.projects.set(key, project);
    return project;
  }

  /** The project root for analysis queries (imports chain bound): the
   *  workspace folder, like the compiler's view of the project. */
  rootOf(file: string): string {
    return this.folderOf(file);
  }

  /* Lifecycle ------------------------------------------------------------ */

  /** Unified ensure (open document wins over disk) including the cross-project
   *  cascade at the routing level. */
  async ensureTsazor(tsazorPath: string, source?: string): Promise<ShadowEntry | null> {
    const resolved = path.resolve(tsazorPath);
    const key = toFileKey(resolved);
    if (this.ensuring.has(key)) return this.findTsazorEntry(resolved);
    this.ensuring.add(key);
    try {
      this.files.set(key, resolved);
      const project = this.projectFor(resolved);
      const entry = await project.service.ensureTsazor(resolved, source);
      if (entry) await this.ensureImported(resolved, entry);
      return entry;
    } finally {
      this.ensuring.delete(key);
    }
  }

  /** The in-flight entry of a file another cascade is still building. */
  private findTsazorEntry(tsazorPath: string): ShadowEntry | null {
    return this.findEntry(shadowPathFor(tsazorPath)) ?? null;
  }

  /** Ensures every shadow the entry imports — routed to its own project so
   *  cross-tsconfig imports (package .tsazor sources) resolve in the
   *  consuming project's program (via the shared lookup). */
  private async ensureImported(_tsazorPath: string, entry: ShadowEntry): Promise<void> {
    const imported = entry.importedTsazor ?? [];
    await Promise.all(imported.map((candidate) => (existsSync(candidate) ? this.ensureTsazor(candidate) : Promise.resolve())));
  }

  closeTsazor(tsazorPath: string): void {
    const resolved = path.resolve(tsazorPath);
    const key = toFileKey(resolved);
    this.files.delete(key);
    this.projectFor(resolved).service.closeTsazor(resolved);
  }

  /** Drops and rebuilds the project owning `configPath` on the next access
   *  (didChangeWatchedFiles on tsconfig.json). */
  projectChanged(configPath: string): void {
    for (const [key, project] of [...this.projects]) {
      if (project.configPath !== undefined && toProjectKey(path.resolve(configPath)) === toProjectKey(path.resolve(project.configPath))) {
        project.service.dispose();
        this.projects.delete(key);
      }
    }
  }

  dispose(): void {
    for (const project of this.projects.values()) project.service.dispose();
    this.projects.clear();
  }

  /* Scan and dependents -------------------------------------------------- */

  /** Scans every workspace root, routing each file to its project (2.4's T4
   *  scan, now tsconfig-partitioned). Fire-and-forget per file; returns the
   *  scanned count. */
  async scanAll(): Promise<number> {
    // After the caller's turn (the initialize answer goes out first), then one file at a time with the event loop free
    // in between: a monorepo has a thousand .tsazor files, and the requests that arrive meanwhile must not wait for all.
    await yieldToEventLoop();
    const seen = new Map<string, string>(); // lowercased key → real-case path
    for (const root of this.workspaceRoots) {
      for (const file of findTsazorFiles(root)) seen.set(toFileKey(path.resolve(file)), file);
    }
    for (const file of seen.values()) {
      await this.ensureTsazor(file).catch(() => undefined);
      await yieldToEventLoop();
    }
    return seen.size;
  }

  /** The registered shadows of all projects (reverse edges for dependents). */
  private findEntry(modulePath: string): ShadowEntry | undefined {
    for (const project of this.projects.values()) {
      const entry = project.service.ownEntryOf(modulePath);
      if (entry) return entry;
    }
    return undefined;
  }

  /** The entry behind a shadow module path, over all projects (ShadowLookup). */
  entryOf(modulePath: string): ShadowEntry | undefined {
    return this.findEntry(modulePath);
  }

  /** Files depending on `tsazorPath` (real-case paths): transitive reverse
   *  shadow imports, or — for an `_Imports.tsazor` — the whole subtree below
   *  its directory. */
  dependentsOf(tsazorPath: string): string[] {
    const resolved = path.resolve(tsazorPath);
    const target = toFileKey(resolved);
    if (path.basename(resolved).toLowerCase() === "_imports.tsazor") {
      const dir = toFileKey(path.dirname(resolved));
      return [...this.files].filter(([fileKey]) => pathWithin(fileKey, dir) && fileKey !== target).map(([, file]) => file);
    }
    // Edge list import → dependent, rebuilt per query (entries carry them).
    const edges = new Map<string, Set<string>>();
    for (const project of this.projects.values()) {
      for (const { file, entry } of project.service.allEntries()) {
        for (const imported of entry.importedTsazor ?? []) {
          const edge = toFileKey(imported);
          const set = edges.get(edge) ?? new Set<string>();
          set.add(toFileKey(file));
          edges.set(edge, set);
        }
      }
    }
    const found = new Set<string>();
    const queue = [target];
    for (let at = 0; at < queue.length; at++) {
      for (const next of edges.get(queue[at]!) ?? []) {
        if (found.has(next)) continue;
        found.add(next);
        queue.push(next);
      }
    }
    found.delete(target);
    return [...found]
      .map((key) => this.files.get(key))
      .filter((file): file is string => file !== undefined);
  }
}

/** A macrotask's pause: what is queued (a request, a document change) runs first. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
