/**
 * 4.1 — HMR invalidation.
 *
 * Vite's default propagation stops at self-accepting modules and only knows
 * real import edges. The Tsazor graph has three more kinds of dependency
 * (A3 import model + 2.1 metadata cache) that are invisible there:
 *
 * - `_Imports.tsazor` is never loaded as a module; it passes its directives on
 *   to every transformed file below its folder.
 * - Markup tags that were unresolved at the last transform (TZS005) embed
 *   no import — as soon as their component appears, the files must be
 *   transformed again.
 * - The consumer's codegen depends on the target's parameter metadata
 *   (2.2/2.3): when a component changes (also via code-behind/base), the
 *   files using its tags depend on it anew.
 *
 * `TransformRegistry` records these edges per transformed file;
 * `planInvalidation` turns a watch change into ".tsazor files to transform
 * again" and "the route manifest may look different". The caller
 * (plugin) applies the result to Vite's module graph. Paths are compared
 * case-insensitively, as Windows requires (normalizeFileKey).
 */
import path from "node:path";
import type { CodegenResult } from "@tsazor/compiler";

/** Absolute, POSIX-separated, lowercased form of a path (Windows rule). */
export function normalizeFileKey(file: string): string {
  return path.resolve(file).replace(/\\/g, "/").toLowerCase();
}

export function sameFile(a: string, b: string): boolean {
  return normalizeFileKey(a) === normalizeFileKey(b);
}

/** Route-relevant metadata of a page (route manifest). */
export interface RouteSignature {
  templates: string[];
  layout?: string;
  authorize?: boolean;
  authorizeData?: { roles?: string[]; policy?: string };
}

type CodegenMetadata = CodegenResult["metadata"];

/**
 * Everything the transform of a .tsazor file recorded — the edges
 * for 4.1. `routes`/`layoutName`/`unresolvedTags` are also updated by the hot
 * update (its own recompile); `componentFiles` only in the transform.
 */
export interface TransformRecord {
  /** Absolute path, as reported by the transform. */
  file: string;
  /** Tags (TZS005) that stayed unresolved at the last transform. */
  unresolvedTags: string[];
  /** `@layout` name (also in `_Imports.tsazor` — the chain's base layout). */
  layoutName?: string;
  routes: RouteSignature;
  /** Absolute component files the file's tags resolved to (2.1 metadata). */
  componentFiles: string[];
}

function newRecord(file: string): TransformRecord {
  return { file, unresolvedTags: [], routes: { templates: [] }, componentFiles: [] };
}

/**
 * The plugin's per-file record of what each transformed `.tsazor` file
 * depends on (resolved component files, unresolved tags, routes, `@layout`):
 * the edges HMR invalidation follows beyond Vite's import graph.
 */
export class TransformRegistry {
  private readonly records = new Map<string, TransformRecord>();

  /** The record of a file (case-insensitive), or undefined. */
  get(file: string): TransformRecord | undefined {
    return this.records.get(normalizeFileKey(file));
  }

  /** Absolute paths (original spelling) of all transformed files. */
  files(): string[] {
    return [...this.records.values()].map((record) => record.file);
  }

  private entryFor(file: string): TransformRecord {
    const key = normalizeFileKey(file);
    let record = this.records.get(key);
    if (!record) {
      record = newRecord(file);
      this.records.set(key, record);
    }
    return record;
  }

  /** Updates routes/tags from the hot-update recompile (edges stay). */
  recordDynamic(file: string, metadata: CodegenMetadata | undefined, isImports: boolean): void {
    const record = this.entryFor(file);
    if (metadata === undefined) return;
    if (isImports) {
      record.unresolvedTags = [];
      record.layoutName = metadata.layout;
      record.routes = { templates: [] };
      return;
    }
    record.unresolvedTags = [...metadata.unresolvedTags];
    record.layoutName = metadata.layout ?? record.layoutName;
    record.routes = {
      templates: [...metadata.routeTemplates],
      ...(metadata.layout !== undefined ? { layout: metadata.layout } : {}),
      ...(metadata.authorize === true ? { authorize: true } : {}),
      ...(metadata.authorizeData !== undefined ? { authorizeData: metadata.authorizeData } : {}),
    };
  }

  /** Records from the transform: routes, unresolved tags, consumed component files. */
  recordTransform(file: string, metadata: CodegenMetadata, componentFiles: Iterable<string>): void {
    this.recordDynamic(file, metadata, false);
    const record = this.entryFor(file);
    record.componentFiles = [...componentFiles];
  }

  /** Drops the record of a file (case-insensitive), e.g. after it was deleted. */
  remove(file: string): void {
    this.records.delete(normalizeFileKey(file));
  }

  /** Files whose tags resolved to `componentFile` (consumer edges). */
  consumersOf(componentFile: string): string[] {
    const target = normalizeFileKey(componentFile);
    const result: string[] = [];
    for (const record of this.records.values()) {
      if (record.componentFiles.some((file) => normalizeFileKey(file) === target)) result.push(record.file);
    }
    return result;
  }

  /** Files that left the tag `tag` unresolved (case-insensitive = Windows/Blazor rule). */
  filesWithUnresolvedTag(tag: string): string[] {
    const lowered = tag.toLowerCase();
    const result: string[] = [];
    for (const record of this.records.values()) {
      if (record.unresolvedTags.some((candidate) => candidate.toLowerCase() === lowered)) result.push(record.file);
    }
    return result;
  }

  /** Does any record (page or `_Imports`) use `@layout <className>`? */
  hasLayoutNameOf(className: string): boolean {
    const lowered = className.toLowerCase();
    return [...this.records.values()].some((record) => (record.layoutName ?? "").toLowerCase() === lowered);
  }
}

/* Invalidation plan ----------------------------------------------------------- */

/** What `planInvalidation` computes for one file change. */
export interface InvalidationPlan {
  /** .tsazor files whose generated module may change — transform them again. */
  retransform: string[];
  /** The `virtual:tsazor-routes` manifest may look different (Vite: reload). */
  routesModule: boolean;
  /** The file is a `.tsazor.css` sidecar that disappeared — Vite cannot take back
   *  the injected style; full reload instead of HMR. */
  fullReload: boolean;
}

export interface WatchEventContext {
  /** Absolute path of the changed file, as the watcher reports it. */
  file: string;
  event: "update" | "create" | "delete";
  /** Freshly compiled metadata of the file (the hot update reads + compiles). Undefined: deleted/unreadable. */
  metadata: CodegenMetadata | undefined;
  /** The plugin's registry (transform records). */
  registry: TransformRegistry;
  /** All .tsazor files under `dir` (route-scan rules), absolute. */
  listTsazorUnder: (dir: string) => Promise<string[]>;
  /** Metadata reverse edges (2.1 cache): component files whose chain reads `file`. */
  dependentsOf: (file: string) => string[];
}

/** Whether `file` is an `_Imports.tsazor` (name compared case-insensitively). */
export function isImportsFile(file: string): boolean {
  return path.basename(file).toLowerCase() === "_imports.tsazor";
}

/**
 * Turns a file change into the invalidation plan. Semantics per 4.1:
 * sidecar added/removed ⇒ owner; `_Imports.tsazor` ⇒ all files
 * below it; newly added component ⇒ files with a previously unresolved
 * tag; any component change ⇒ its tag consumers (metadata codegen);
 * `@page`/layout added or removed ⇒ route manifest. Base chains are covered
 * via `dependentsOf` (2.1 cache).
 */
export async function planInvalidation(context: WatchEventContext): Promise<InvalidationPlan> {
  const { file, event, metadata, registry, listTsazorUnder, dependentsOf } = context;
  const added = new Set<string>([normalizeFileKey(file)]);
  const mark = (candidates: Iterable<string>): string[] => {
    const result: string[] = [];
    for (const candidate of candidates) {
      const key = normalizeFileKey(candidate);
      if (added.has(key)) continue;
      added.add(key);
      result.push(candidate);
    }
    return result;
  };
  const dependents = mark(dependentsOf(file));

  const plan: InvalidationPlan = { retransform: [], routesModule: false, fullReload: false };

  // Code-behind sidecar: the owner .tsazor changes its class (its tag consumers
  // too — the component's flattened parameter picture changes).
  if (/\.tsazor\.ts$/i.test(file)) {
    const owner = file.slice(0, -".ts".length);
    registry.remove(file);
    plan.retransform = mark([owner, ...dependents, ...registry.consumersOf(owner)]);
    return plan;
  }

  // Scoped CSS sidecar: Vite handles content changes itself; adding/removing
  // changes the generated module (import + scope attribute).
  if (/\.tsazor\.css$/i.test(file)) {
    const owner = file.slice(0, -".css".length);
    if (event === "update") return plan;
    if (event === "delete") plan.fullReload = true;
    plan.retransform = mark([owner]);
    return plan;
  }

  if (isImportsFile(file)) {
    const previous = registry.get(file);
    const layoutChanged = previous !== undefined && previous.layoutName !== (metadata?.layout ?? undefined);
    registry.recordDynamic(file, metadata, true);
    plan.retransform = mark([...dependents, ...(await listTsazorUnder(path.dirname(file)))]);
    plan.routesModule = metadata !== undefined && layoutChanged;
    return plan;
  }

  if (!file.toLowerCase().endsWith(".tsazor")) {
    // Any .ts: the metadata cache knows the base chains — transform files that
    // inherit a class from it again (Vite covers direct imports).
    plan.retransform = dependents;
    return plan;
  }

  const className = path.basename(file).replace(/\.[^.]+$/, "");
  const previous = registry.get(file);

  if (event === "update") {
    registry.recordDynamic(file, metadata, false);
    plan.retransform = mark([...dependents, ...registry.consumersOf(file)]);
    plan.routesModule = metadata !== undefined && routesSignatureChanged(previous?.routes, metadata);
    return plan;
  }

  if (event === "create") {
    registry.recordDynamic(file, metadata, false);
    const consumers = new Set(registry.filesWithUnresolvedTag(className));
    for (const consumer of registry.consumersOf(file)) consumers.add(consumer);
    plan.retransform = mark([...dependents, ...consumers]);
    // New page, new layout — both change the route manifest.
    plan.routesModule =
      (metadata !== undefined && routesSignatureChanged(undefined, metadata)) ||
      (metadata !== undefined && layoutNameMatches(registry, className));
    return plan;
  }

  // delete
  const hadRoutes = previous !== undefined && previous.routes.templates.length > 0;
  const hadLayoutUse = layoutNameMatches(registry, className);
  registry.remove(file);
  plan.retransform = mark([...dependents, ...registry.consumersOf(file)]);
  plan.routesModule = hadRoutes || hadLayoutUse;
  return plan;
}

function routesSignatureChanged(previous: RouteSignature | undefined, metadata: CodegenMetadata): boolean {
  const after: RouteSignature = {
    templates: metadata.routeTemplates,
    ...(metadata.layout !== undefined ? { layout: metadata.layout } : {}),
    ...(metadata.authorize === true ? { authorize: true } : {}),
    ...(metadata.authorizeData !== undefined ? { authorizeData: metadata.authorizeData } : {}),
  };
  return signatureOf(previous) !== signatureOf(after);
}

function signatureOf(routes: RouteSignature | undefined): string {
  return JSON.stringify({
    templates: [...(routes?.templates ?? [])].sort(),
    layout: routes?.layout,
    authorize: routes?.authorize === true,
    authorizeData: routes?.authorizeData !== undefined ? { ...routes.authorizeData } : undefined,
  });
}

/** Files (or _Imports) with an `@layout <className>` directive. */
function layoutNameMatches(registry: TransformRegistry, className: string): boolean {
  return registry.hasLayoutNameOf(className);
}