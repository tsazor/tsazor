import {
  COMPONENT_MANIFEST_VERSION,
  extractModuleMetadata,
  extractTsazorMetadata,
  resolveComponentMetadata,
  RUNTIME_MODULE,
  type ComponentManifest,
  type ComponentMetadata,
  type ImportInfo,
  type MetadataHost,
  type ModuleMetadata,
  type TypeReference,
} from "@tsazor/compiler";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { collectImportsSync, findPackageDir, rebaseSpecifier } from "./imports.js";
import { mapPath } from "./path-mapping.js";
import { classNameForFile, createFileContext, type FileContext } from "./resolver.js";
import { RUNTIME_MANIFEST } from "./runtime-manifest.generated.js";

/**
 * Component parameter metadata over the file system (roadmap 2.1): the
 * compiler's syntactic extractor and resolver (`@tsazor/compiler`
 * metadata.ts) plus a host that reads files, follows relative imports,
 * code-behinds and `_Imports` chains, and reads package manifests.
 *
 * Cache: per-file module metadata and per-component resolved metadata, each
 * entry stamped with the mtime+size of every file it was built from (a
 * .tsazor: itself, its X.tsazor.ts — also while absent — and its _Imports
 * layers; a resolved component: all of that for every class in its base
 * chain, plus package manifests). An entry is reused while every stamp still
 * matches, so editing a component, its code-behind or a base invalidates
 * exactly what depends on it. `dependenciesOf`/`dependentsOf`/`invalidate`
 * expose the edges for HMR (4.1).
 */

type Stamps = Map<string, string>;

interface ModuleEntry {
  stamps: Stamps;
  value: ModuleMetadata | undefined;
}

interface ComponentEntry {
  /** Source file of the component (the reverse-edge target). */
  file: string;
  stamps: Stamps;
  value: ComponentMetadata | undefined;
}

export interface MetadataCacheOptions {
  /**
   * Directory of @tsazor/runtime's own package: modules below it are
   * runtime-internal (their relative imports are runtime names) — used when
   * generating the runtime manifest.
   */
  runtimeDir?: string;
}

const MODULE_EXTENSIONS = [".ts", ".tsx", ".mts", ".tsazor", "/index.ts"];

function stampOf(file: string): string {
  try {
    const stat = statSync(file);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function stillValid(stamps: Stamps): boolean {
  for (const [file, stamp] of stamps) if (stampOf(file) !== stamp) return false;
  return true;
}

const normalize = (file: string): string => path.resolve(file);

export class MetadataCache {
  private readonly modules = new Map<string, ModuleEntry>();
  private readonly components = new Map<string, ComponentEntry>();
  private readonly manifests = new Map<string, { stamp: string; manifest: ComponentManifest | undefined }>();
  /** What was wrong with a manifest file, as last read (TZS036). */
  private readonly problems = new Map<string, ManifestProblem>();
  /** A counter of manifest lookups, and each manifest file's last one: `manifestProblems(since)`. */
  private manifestUses = 0;
  private readonly manifestLastUse = new Map<string, number>();
  private readonly roots = new Map<string, string>();
  private readonly runtimeDir: string | undefined;

  constructor(options: MetadataCacheOptions = {}) {
    this.runtimeDir = options.runtimeDir === undefined ? undefined : normalize(options.runtimeDir);
  }

  /** Syntactic metadata of one module (.tsazor or .ts), cached per file. */
  moduleAt(file: string): ModuleMetadata | undefined {
    return this.moduleEntry(normalize(file)).value;
  }

  /** Resolved metadata of the component a file declares: its default export, or the named `exportName` (.ts). */
  componentOfFile(file: string, exportName?: string): ComponentMetadata | undefined {
    const absolute = normalize(file);
    const key = `${absolute}#${exportName ?? "default"}`;
    const cached = this.components.get(key);
    if (cached && stillValid(cached.stamps)) return cached.value;
    const stamps: Stamps = new Map();
    const host = this.recordingHost(stamps);
    const module = host.moduleAt(absolute);
    const local = module?.exports.get(exportName ?? "default");
    const value = module && local !== undefined ? resolveComponentMetadata(module, local, host) : undefined;
    this.components.set(key, { file: absolute, stamps, value });
    return value;
  }

  /** A component from a package manifest: `@tsazor/runtime` (embedded) or a bare package above `fromFile`. */
  packageComponent(specifier: string, exportName: string, fromFile: string): ComponentMetadata | undefined {
    return this.packageManifest(specifier, path.dirname(fromFile))?.manifest.components[exportName];
  }

  /** The manifest of a package (the embedded runtime manifest for `@tsazor/runtime`); a
   *  subpath's own manifest — `@tsazor/bootstrap/templates` — comes from its own dist dir. */
  packageManifest(name: string, fromDir: string): { manifest: ComponentManifest; file?: string } | undefined {
    if (name === RUNTIME_MODULE) return { manifest: RUNTIME_MANIFEST };
    const parts = name.split("/");
    const nameLength = name.startsWith("@") ? 2 : 1;
    const packageSpec = parts.slice(0, nameLength).join("/");
    const subpath = nameLength < parts.length ? parts.slice(nameLength).join("/") : undefined;
    const packageDir = findPackageDir(packageSpec, fromDir);
    if (!packageDir) return undefined;
    // A subpath carries its own manifest next to its built index: the specifier's exports map
    // says where (`./templates` → `./dist/templates`), and its manifest sits at its root — the
    // sub-dir's own `package.json` has no pointer (manifestFileOf only reads the root's).
    let file = subpath === undefined ? manifestFileOf(packageDir) : undefined;
    if (file === undefined && subpath !== undefined) {
      const declared = this.resolveDeclarationFile(name, path.join(fromDir, "_"));
      const dir = declared === undefined ? path.join(packageDir, subpath) : path.dirname(declared);
      const own = path.join(dir, "tsazor-components.json");
      file = isFile(own) ? own : manifestFileOf(dir);
    }
    if (!file) return undefined;
    this.manifestLastUse.set(file, ++this.manifestUses);
    const stamp = stampOf(file);
    const cached = this.manifests.get(file);
    if (cached && cached.stamp === stamp) return cached.manifest ? { manifest: cached.manifest, file } : undefined;
    let manifest: ComponentManifest | undefined;
    let problem: Omit<ManifestProblem, "packageName" | "file"> | undefined;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as { tsazorComponentManifest?: unknown; components?: unknown } | null;
      if (typeof raw !== "object" || raw === null || typeof raw.components !== "object" || raw.components === null) {
        problem = { severity: "error", message: "is not a component manifest (no `components`)" };
      } else {
        const version = raw.tsazorComponentManifest;
        if (typeof version === "number" && version > COMPONENT_MANIFEST_VERSION) {
          problem = {
            severity: "warning",
            message: `is format version ${version}, newer than this Tsazor reads (${COMPONENT_MANIFEST_VERSION}): update Tsazor, or use a release of the package built for this one`,
          };
        }
        // Read as far as this version knows it: fields it doesn't know are ignored.
        manifest = absolutizeManifest(raw as ComponentManifest, packageDir);
      }
    } catch (error) {
      manifest = undefined;
      problem = { severity: "error", message: `can't be read (${error instanceof Error ? error.message : String(error)})` };
    }
    this.manifests.set(file, { stamp, manifest });
    if (problem) this.problems.set(file, { packageName: name, file, ...problem, message: `The component manifest of "${name}" ${problem.message}.` });
    else this.problems.delete(file);
    return manifest ? { manifest, file } : undefined;
  }

  /** A mark for `manifestProblems(since)`: a check run asks only about the manifests it used itself. */
  manifestMark(): number {
    return this.manifestUses;
  }

  /**
   * The manifests that are unreadable or newer than this Tsazor (`tsazor check` reports them, TZS036): every one read
   * so far, or those used after the mark `since`.
   */
  manifestProblems(since?: number): ManifestProblem[] {
    const problems = [...this.problems.values()];
    return since === undefined ? problems : problems.filter((problem) => (this.manifestLastUse.get(problem.file) ?? 0) > since);
  }

  /** Files the component's metadata was built from (itself first). Empty until it was resolved. */
  dependenciesOf(file: string, exportName?: string): string[] {
    const entry = this.components.get(`${normalize(file)}#${exportName ?? "default"}`);
    return entry ? [...entry.stamps.keys()] : [];
  }

  /** Component files whose cached metadata depends on `file` (HMR: re-check these). */
  dependentsOf(file: string): string[] {
    const target = normalize(file).toLowerCase();
    const result = new Set<string>();
    for (const entry of this.components.values()) {
      for (const dependency of entry.stamps.keys()) {
        if (dependency.toLowerCase() === target) result.add(entry.file);
      }
    }
    return [...result];
  }

  /** Drops everything built from `file`; returns the affected component files. */
  invalidate(file: string): string[] {
    const target = normalize(file).toLowerCase();
    const affected = new Set<string>();
    for (const [key, entry] of this.modules) {
      if ([...entry.stamps.keys()].some((dependency) => dependency.toLowerCase() === target)) this.modules.delete(key);
    }
    for (const [key, entry] of this.components) {
      if ([...entry.stamps.keys()].some((dependency) => dependency.toLowerCase() === target)) {
        affected.add(entry.file);
        this.components.delete(key);
      }
    }
    return [...affected];
  }

  /**
   * Resolves a module specifier imported by `fromFile` to a source file: a relative one, or one the app's tsconfig
   * `paths` map (`@/components/ui/Button.tsazor`, path-mapping.ts). Packages resolve elsewhere.
   */
  resolveFile(specifier: string, fromFile: string): string | undefined {
    if (!specifier.startsWith(".") && !path.isAbsolute(specifier)) {
      for (const mapped of mapPath(specifier, fromFile)) {
        const file = sourceFileAt(mapped);
        if (file) return file;
      }
      return undefined;
    }
    return sourceFileAt(path.resolve(path.dirname(fromFile), specifier));
  }

  /**
   * The declaration file of a package specifier (`@tsazor/ui`, `pkg/sub`)
   * — its `exports` types entry, else `types`/`typings` — or, inside a
   * declaration file, the `.d.ts` behind a relative `./x.js`. Only type
   * information is read from it (aliases, re-exports); components of packages
   * still come from their manifests. `@tsazor/runtime` has its own path.
   */
  resolveDeclarationFile(specifier: string, fromFile: string): string | undefined {
    if (specifier.startsWith(".")) {
      if (!fromFile.endsWith(".d.ts")) return undefined;
      const base = path.resolve(path.dirname(fromFile), specifier).replace(/\.[mc]?js$/, "");
      const candidate = `${base}.d.ts`;
      return isFile(candidate) ? candidate : undefined;
    }
    if (specifier === RUNTIME_MODULE || path.isAbsolute(specifier)) return undefined;
    const parts = specifier.split("/");
    const nameLength = specifier.startsWith("@") ? 2 : 1;
    const name = parts.slice(0, nameLength).join("/");
    const subpath = parts.length > nameLength ? `./${parts.slice(nameLength).join("/")}` : ".";
    const packageDir = findPackageDir(name, path.dirname(fromFile));
    if (!packageDir) return undefined;
    let manifest: { exports?: unknown; types?: unknown; typings?: unknown };
    try {
      manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
    } catch {
      return undefined;
    }
    let types: unknown;
    const exportsField = manifest.exports;
    if (exportsField && typeof exportsField === "object") {
      const entry = (exportsField as Record<string, unknown>)[subpath];
      types = entry && typeof entry === "object" ? (entry as { types?: unknown }).types : undefined;
    }
    if (types === undefined && subpath === ".") types = manifest.types ?? manifest.typings;
    if (typeof types !== "string") return undefined;
    const file = path.resolve(packageDir, types);
    return file.endsWith(".d.ts") && isFile(file) ? file : undefined;
  }

  private moduleEntry(file: string): ModuleEntry {
    const cached = this.modules.get(file);
    if (cached && stillValid(cached.stamps)) return cached;
    const stamps: Stamps = new Map([[file, stampOf(file)]]);
    let value: ModuleMetadata | undefined;
    let source: string | undefined;
    try {
      source = readFileSync(file, "utf8");
    } catch {
      source = undefined;
    }
    if (source !== undefined) {
      const runtimeInternal = this.isRuntimeInternal(file);
      if (file.endsWith(".tsazor")) {
        const codeBehind = `${file}.ts`;
        stamps.set(codeBehind, stampOf(codeBehind));
        const chain = collectImportsSync(path.dirname(file), this.projectRootOf(file));
        for (const layer of chain.layers) stamps.set(normalize(layer.file), stampOf(layer.file));
        const context = createFileContext(file, chain);
        value = extractTsazorMetadata(source, file, {
          className: classNameForFile(file),
          inheritedImports: context.inheritedImports,
          codeBehind: existsSync(codeBehind),
          resolveType: (name, usings) => context.resolveType(name, usings),
          runtimeInternal,
        });
      } else {
        value = extractModuleMetadata(source, file, { runtimeInternal });
      }
    }
    const entry: ModuleEntry = { stamps, value };
    this.modules.set(file, entry);
    return entry;
  }

  /** A host that records the stamps of every file the resolution reads. */
  private recordingHost(stamps: Stamps): MetadataHost {
    const record = (file: string): ModuleMetadata | undefined => {
      const entry = this.moduleEntry(normalize(file));
      for (const [dependency, stamp] of entry.stamps) stamps.set(dependency, stamp);
      return entry.value;
    };
    return {
      moduleAt: (file) => record(file),
      resolveModule: (specifier, fromFile) => {
        // Packages: their declaration files, so a parameter typed with a
        // package's type alias (`Intent` from `@tsazor/ui`) can be categorized.
        const file = this.resolveFile(specifier, fromFile) ?? this.resolveDeclarationFile(specifier, fromFile);
        return file ? record(file) : undefined;
      },
      packageComponent: (specifier, exportName, fromFile) => {
        const found = this.packageManifest(specifier, path.dirname(fromFile));
        if (found?.file) stamps.set(found.file, stampOf(found.file));
        return found?.manifest.components[exportName];
      },
    };
  }

  private isRuntimeInternal(file: string): boolean {
    if (this.runtimeDir === undefined) return false;
    const relative = path.relative(this.runtimeDir, file);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }

  /** Upper bound of a .tsazor's _Imports chain: the nearest directory with a package.json. */
  private projectRootOf(file: string): string {
    const dir = path.dirname(file);
    const cached = this.roots.get(dir);
    if (cached) return cached;
    let current = dir;
    while (!existsSync(path.join(current, "package.json"))) {
      const parent = path.dirname(current);
      if (parent === current) {
        current = dir;
        break;
      }
      current = parent;
    }
    this.roots.set(dir, current);
    return current;
  }
}

/** The cache the resolver, the Vite plugin and the language server share. */
export const defaultMetadataCache = new MetadataCache();

/** The source file a resolved specifier names: itself, or with a module extension (`./x.js` → `./x.ts`, tsc-style). */
function sourceFileAt(base: string): string | undefined {
  const candidates = [base, ...MODULE_EXTENSIONS.map((extension) => base + extension)];
  if (/\.js$/.test(base)) candidates.splice(1, 0, base.replace(/\.js$/, ".ts"));
  return candidates.find((candidate) => /\.(tsazor|[mc]?tsx?)$/.test(candidate) && !candidate.endsWith(".d.ts") && isFile(candidate));
}

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** package.json `tsazor.components` (the generated manifest), if the package ships one. */
function manifestFileOf(packageDir: string): string | undefined {
  try {
    const manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")) as { tsazor?: { components?: unknown } };
    const relative = manifest.tsazor?.components;
    if (typeof relative !== "string") return undefined;
    const file = path.resolve(packageDir, relative);
    return isFile(file) ? file : undefined;
  } catch {
    return undefined;
  }
}

/* Tag lookup ------------------------------------------------------------------- */

/**
 * Metadata of the component a markup tag resolves to — the same resolution
 * as `resolveComponent` (explicit `@import` binding first, then enclosing
 * folders, `@using` sources, runtime built-ins, package exports).
 */
export function componentMetadataForTag(
  context: FileContext,
  tagName: string,
  usings: string[],
  imports: readonly ImportInfo[] = [],
  cache: MetadataCache = defaultMetadataCache,
): ComponentMetadata | null {
  for (const info of [...imports, ...context.inheritedImports]) {
    const binding = info.bindings.find((candidate) => candidate.local === tagName && !candidate.typeOnly);
    if (!binding || binding.imported === "*") continue;
    return importedComponent(info.specifier, binding.imported, context.filePath, cache) ?? null;
  }
  const resolved = context.resolveComponent(tagName, usings);
  if (!resolved) return null;
  if (resolved.exportName) return cache.packageComponent(resolved.specifier, resolved.exportName, context.filePath) ?? null;
  return cache.componentOfFile(path.resolve(context.fileDir, resolved.specifier)) ?? null;
}

function importedComponent(specifier: string, imported: string, fromFile: string, cache: MetadataCache): ComponentMetadata | undefined {
  const file = cache.resolveFile(specifier, fromFile);
  if (!file && !specifier.startsWith(".") && !path.isAbsolute(specifier)) return cache.packageComponent(specifier, imported, fromFile);
  if (!file) return undefined;
  return cache.componentOfFile(file, file.endsWith(".tsazor") || imported === "default" ? undefined : imported);
}

/* Manifests --------------------------------------------------------------------- */

/** A package manifest the cache couldn't read (an error) or read only partly, being newer (a warning). */
export interface ManifestProblem {
  packageName: string;
  /** The manifest file. */
  file: string;
  severity: "error" | "warning";
  message: string;
}

export interface ManifestEntry {
  /** Export name of the component (the tag). */
  exportName: string;
  /** Declaring file. */
  file: string;
  /** Export of `file` the class is (default: `exportName`; ignored for .tsazor). */
  localExport?: string;
}

/**
 * Builds a package manifest: every entry resolved (inheritance flattened),
 * paths relative to the package directory (POSIX). Entries that are not
 * components (chain does not reach ComponentBase) are skipped.
 */
export function buildPackageManifest(options: {
  packageDir: string;
  packageName?: string;
  entries: readonly ManifestEntry[];
  runtimeInternal?: boolean;
}): ComponentManifest {
  const packageDir = normalize(options.packageDir);
  const cache = new MetadataCache(options.runtimeInternal ? { runtimeDir: packageDir } : {});
  const manifest: ComponentManifest = { tsazorComponentManifest: 1, components: {} };
  if (options.packageName) manifest.package = options.packageName;
  for (const entry of options.entries) {
    const file = normalize(entry.file);
    const metadata = cache.componentOfFile(file, file.endsWith(".tsazor") ? undefined : (entry.localExport ?? entry.exportName));
    if (!metadata?.isComponent) continue;
    manifest.components[entry.exportName] = relativizeComponent({ ...metadata, name: entry.exportName }, packageDir);
  }
  return manifest;
}

/** Manifest entries of a TS package entry module: its `export { X } from "./x.js"` re-exports. */
export function manifestEntriesOfModule(entryFile: string): ManifestEntry[] {
  const cache = new MetadataCache();
  const module = cache.moduleAt(entryFile);
  const entries: ManifestEntry[] = [];
  for (const reexport of module?.reexports ?? []) {
    if (!reexport.names) continue;
    const file = cache.resolveFile(reexport.specifier, entryFile);
    if (!file) continue;
    for (const [exported, imported] of reexport.names) entries.push({ exportName: exported, file, localExport: imported });
  }
  return entries;
}

/**
 * The runtime's manifest, built from its sources (`<runtimeDir>/src/index.ts`). Without the methods: the runtime's
 * declarations come from tsc, and the parameters are what the manifest is for.
 */
export function buildRuntimeManifest(runtimeDir: string): ComponentManifest {
  const manifest = buildPackageManifest({
    packageDir: runtimeDir,
    packageName: RUNTIME_MODULE,
    entries: manifestEntriesOfModule(path.join(runtimeDir, "src", "index.ts")),
    runtimeInternal: true,
  });
  for (const metadata of Object.values(manifest.components)) delete metadata.methods;
  return manifest;
}

const toPosix = (value: string): string => value.replace(/\\/g, "/");

function relativizeComponent(metadata: ComponentMetadata, packageDir: string): ComponentMetadata {
  const relative = (file: string | undefined): string | undefined =>
    file === undefined ? undefined : path.isAbsolute(file) ? toPosix(path.relative(packageDir, file)) : file;
  const result: ComponentMetadata = { ...metadata, parameters: metadata.parameters.map((parameter) => {
    if (!parameter.references) return parameter;
    return { ...parameter, references: parameter.references.map((ref) => mapFile(ref, relative)) };
  }) };
  if (metadata.methods) {
    result.methods = metadata.methods.map((method) => (method.references ? { ...method, references: method.references.map((ref) => mapFile(ref, relative)) } : method));
  }
  if (metadata.file !== undefined) result.file = relative(metadata.file);
  return result;
}

function absolutizeManifest(manifest: ComponentManifest, packageDir: string): ComponentManifest {
  const absolute = (file: string | undefined): string | undefined => (file === undefined || path.isAbsolute(file) ? file : path.resolve(packageDir, file));
  const components: Record<string, ComponentMetadata> = {};
  for (const [name, metadata] of Object.entries(manifest.components ?? {})) {
    components[name] = {
      ...metadata,
      file: absolute(metadata.file),
      parameters: metadata.parameters.map((parameter) =>
        parameter.references ? { ...parameter, references: parameter.references.map((ref) => mapFile(ref, absolute)) } : parameter,
      ),
    };
    if (metadata.methods) {
      components[name]!.methods = metadata.methods.map((method) => (method.references ? { ...method, references: method.references.map((ref) => mapFile(ref, absolute)) } : method));
    }
  }
  return { ...manifest, components };
}

function mapFile(ref: TypeReference, map: (file: string | undefined) => string | undefined): TypeReference {
  if (ref.file === undefined) return ref;
  return { ...ref, file: map(ref.file) };
}

/* Consumer type declarations (2.4) -------------------------------------------- */

/**
 * Real per-component type declarations from a package manifest: one class per
 * component with its own typed (and documented) parameters and the resolved
 * base class — the consumer-facing counterpart of the permissive `export const
 * X: any` stubs the library builds emitted before 2.4.
 *
 * The typed layer itself (editor LSP, `tsazor check`) does not use these: it
 * checks through the component libraries' own .tsazor shadow modules.
 *
 * Options: `declarationDir` — where the `.d.ts` files land (default: the
 * declaring component's directory, e.g. `src/` when emitting into `dist/`
 * pass `distDir`); `runtimeTypes` — the module runtime parameter types import
 * from. `import`-kind parameter references are rebased from the declaring
 * file's directory to the declaration directory.
 */
export function componentTypeDeclaration(
  entry: ComponentMetadata,
  exportName: string = entry.name,
  options?: { packageDir?: string; declarationDir?: string; runtimeTypes?: string },
): string {
  const runtimeTypes = options?.runtimeTypes ?? "@tsazor/runtime";
  const ownName = entry.name;
  const runtimeNames = new Set<string>();
  /** type imports keyed by rebased specifier → names */
  const typeImports = new Map<string, Set<string>>();
  /** default type imports (another component, `@import Menu from "./Menu.tsazor"`) keyed by specifier → local name */
  const defaultImports = new Map<string, string>();

  const declaringDirOf = (file: string | undefined): string | undefined => {
    if (file === undefined || options?.packageDir === undefined) return undefined;
    const relative = path.isAbsolute(file) ? path.relative(options.packageDir, file) : file;
    if (relative.startsWith("..")) return undefined;
    return path.resolve(options.packageDir, path.dirname(toPosixPath(relative)));
  };

  const collectReferences = (references: readonly TypeReference[] | undefined, own: boolean): void => {
    for (const reference of references ?? []) {
      if (!own) continue; // inherited members come through the base class chain
      if (reference.kind === "runtime" && reference.imported !== "*") {
        runtimeNames.add(reference.imported ?? reference.name);
      } else if (reference.kind === "import" && reference.specifier !== undefined && reference.file !== undefined) {
        const fromDir = declaringDirOf(reference.file);
        const declarationDir = options?.declarationDir;
        // Another component of the library: its declaration lands next to this one
        // (`Menu.d.ts`, imported as `./Menu.js`), not the `.tsazor` the package doesn't ship.
        const sibling = declarationDir !== undefined && reference.specifier.endsWith(".tsazor") && isPathLike(reference.specifier);
        const specifier = sibling
          ? `./${path.basename(reference.specifier, ".tsazor")}.js`
          : fromDir !== undefined && isPathLike(reference.specifier)
            ? rebaseSpecifier(reference.specifier, fromDir, declarationDir ?? fromDir)
            : reference.specifier;
        if (reference.imported === "default") {
          defaultImports.set(specifier, reference.name);
          continue;
        }
        const names = typeImports.get(specifier) ?? new Set<string>();
        names.add(reference.imported ?? reference.name);
        typeImports.set(specifier, names);
      }
      // `local` types are not importable from the manifest — the type stays
      // written as-is; `global` types need no import; `typeParameter`s are
      // declared by the emitted class itself.
    }
  };

  const base = entry.base;
  for (const parameter of entry.typeParameters) {
    collectReferences(parameter.constraintReferences, true);
  }
  for (const parameter of entry.parameters) {
    if (parameter.declaredBy !== ownName || parameter.cascading) continue;
    collectReferences(parameter.references, true);
  }
  for (const method of entry.methods ?? []) {
    if (method.declaredBy === ownName) collectReferences(method.references, true);
  }
  if (base !== undefined && base.resolved) {
    // For these library builds the base is a runtime class (`@inherits InputBase<string>`);
    // a code-behind base is part of the consuming project and not importable here.
    if (!base.codeBehind) runtimeNames.add(base.name);
  }
  if (runtimeNames.size === 0 && (base === undefined || !base.resolved)) runtimeNames.add("ComponentBase");

  const typeParams = entry.typeParameters.map((tp) => tp.name + (tp.constraint ? ` extends ${tp.constraint}` : "") + (tp.default ? ` = ${tp.default}` : ""));
  const typeDecl = typeParams.length > 0 ? `<${typeParams.join(", ")}>` : "";
  const baseName = base !== undefined && base.resolved && !base.codeBehind ? base.name : "ComponentBase";
  const baseArgs = base !== undefined && base.resolved && !base.codeBehind && base.typeArguments && base.typeArguments.length > 0 ? `<${base.typeArguments.join(", ")}>` : "";

  const lines: string[] = [];
  if (runtimeNames.size > 0) {
    lines.push(`import type { ${[...runtimeNames].sort().join(", ")} } from "${runtimeTypes}";`);
  }
  for (const [specifier, name] of [...defaultImports].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`import type ${name} from "${specifier}";`);
  }
  for (const [specifier, names] of [...typeImports].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`import type { ${[...names].sort().join(", ")} } from "${specifier}";`);
  }
  if (lines.length > 0) lines.push("");

  lines.push(`export default class ${exportName}${typeDecl} extends ${baseName}${baseArgs} {`);
  for (const parameter of entry.parameters) {
    // A cascading member is the component's own wiring: not settable from markup, so not part of its type.
    if (parameter.declaredBy !== ownName || parameter.cascading) continue;
    if (parameter.doc) lines.push(`  /** ${parameter.doc.replace(/\n/g, " ")} */`);
    // No annotation: the literal initializer's type (`wrap = false` is a boolean), else `unknown`.
    lines.push(`  ${parameter.name}${parameter.optional ? "?" : ""}: ${parameter.type ?? parameter.inferredType ?? "unknown"};`);
  }
  // Its public methods: plain TypeScript (a code-behind, a test) calls them on a reference too.
  for (const method of entry.methods ?? []) {
    if (method.declaredBy !== ownName) continue;
    if (method.doc) lines.push(`  /** ${method.doc.replace(/\n/g, " ")} */`);
    lines.push(`  ${method.name}${method.typeParameters ?? ""}(${method.parameters}): ${method.returnType};`);
  }
  lines.push("}");
  return `${lines.join("\n")}\n`;
}

/** d.ts text of every component in a manifest, keyed by export name. */
export function componentTypeDeclarations(
  manifest: ComponentManifest,
  options?: { packageDir?: string; declarationDir?: string; runtimeTypes?: string },
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [exportName, entry] of Object.entries(manifest.components)) {
    result[exportName] = componentTypeDeclaration(entry, exportName, options);
  }
  return result;
}

function isPathLike(specifier: string): boolean {
  return specifier.startsWith(".") || path.isAbsolute(specifier);
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}
