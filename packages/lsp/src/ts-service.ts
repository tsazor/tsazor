import { buildShadowModule, isShadowPath, shadowPathFor, type ShadowModule } from "./shadow-module.js";
import { TsazorGenMap } from "./ts-mapping.js";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";
import { inferTypeArgument, type TypedTagInferenceRequest } from "@tsazor/compiler";

/**
 * The TypeScript type layer (v2): one `ts.LanguageService` per workspace over
 * shadow modules (`<dir>/<Name>.tsazor.gen.ts`, virtual) plus every real file
 * the shadows import (code-behind sidecars, project TS, node_modules d.ts).
 *
 * The host only virtualizes shadow paths; everything else is read from disk,
 * so lib.d.ts resolution and node_modules d.ts come for free.
 */

export interface ShadowEntry {
  /** The shadow module (virtual path + code + raw mappings). */
  shadow: ShadowModule;
  /** Monotonic script version — bumped on every rebuild. */
  version: number;
  /** .tsazor mtime when built from disk (on-demand cache for closed files). */
  mtimeMs?: number;
  /** .tsazor files this shadow imports (shadow graph edges for dependents). */
  importedTsazor?: readonly string[];
}

/** A single-line .tsazor patch producing the completion anchor (`this.<prefix>`). */
export interface SourcePatch {
  line: number;
  start: number;
  end: number;
  replacement: string;
  /**
   * The generated-text needle whose END is the query cursor. Defaults to
   * `replacement` (cursor right after the baked text); the explicit-form
   * variant (`@(...)` wrap for trailing dots) bakes a longer chain than it
   * replaces, so it names the chain explicitly.
   */
  cursorAfter?: string;
}

export interface GenPosition {
  line: number;
  column: number;
}

interface VariantModule {
  code: string;
  version: number;
  /** Real-case module path (for the script-name list). */
  path: string;
}

const toKey = (modulePath: string): string => modulePath.replace(/\\/g, "/").toLowerCase();

/** Case-insensitive containment test: is `child` `parent` or below it? */
export function pathWithin(child: string, parent: string): boolean {
  const c = toKey(path.resolve(child));
  const p = toKey(path.resolve(parent));
  return c === p || c.startsWith(`${p}/`);
}

/** The `tsconfig.json` nearest above `dir`, walking up to (and including)
 *  `bound` — per-app options for a file, instead of one config for the whole
 *  workspace folder. */
export function findNearestTsconfig(dir: string, bound: string): string | undefined {
  let current = path.resolve(dir);
  const limit = path.resolve(bound);
  for (;;) {
    const candidate = path.join(current, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    if (toKey(current) === toKey(limit)) return undefined;
    const parent = path.dirname(current);
    if (parent === current || !pathWithin(parent, limit)) return undefined;
    current = parent;
  }
}

function fallbackCompilerOptions(): ts.CompilerOptions {
  return {
    ...ts.getDefaultCompilerOptions(),
    strict: true,
    target: ts.ScriptTarget.ES2022,
    // Full lib file names: a CompilerOptions `lib` set directly (not via
    // tsconfig parsing) is used raw by pathForLibFile() — short entries like
    // "es2022" get module-resolved inside typescript/lib and resolve to
    // nothing (0 lib files in the program).
    lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    // The generated code imports the real sidecar as `./X.tsazor.ts`.
    allowImportingTsExtensions: true,
    // Same emit as the Vite plugin: standard (TC39) decorators, [[Define]]
    // class fields.
    experimentalDecorators: false,
    useDefineForClassFields: true,
    allowJs: true,
    skipLibCheck: true,
    // NOTE: do not set `types: []` here — combined with an explicit `lib` it
    // breaks global-type resolution ("Cannot find global type 'Array'").
    // TS 5.9+ resolves lib entries as *modules*; in a workspace without the
    // matching packages that fails into non-existent paths, so pin the
    // classic fallback into this package's installed typescript/lib.
    libReplacement: false,
    noEmit: true,
  };
}

/** Lib d.ts directory: env override → installed typescript (of this package)
 *  → shipped `lib/` next to the bundle → installed typescript fallback. */
function resolveLibDir(): string {
  if (process.env.TSAZOR_TS_LIB_DIR) return path.resolve(process.env.TSAZOR_TS_LIB_DIR);
  try {
    // require.resolve cannot touch .d.ts files — resolve the main module
    // instead. fileURLToPath: `__dirname` is unreliable under vitest/ESM.
    const pkgJson = fileURLToPath(new URL("../package.json", import.meta.url));
    return path.dirname(createRequire(pkgJson).resolve("typescript"));
  } catch {
    // Bundled server (VS Code): the lib files ship next to the bundle at
    // dist/lib (copied by the packaging build), and the bundle cannot resolve
    // the typescript package itself (the package root owns the node_modules).
    if (process.argv[1]) {
      const bundled = path.join(path.dirname(path.resolve(process.argv[1])), "lib");
      if (existsSync(bundled)) return bundled;
    }
    return path.dirname(ts.getDefaultLibFileName({}));
  }
}

/**
 * The tsconfig's own declaration files (`include`d `env.d.ts`, `vite-env.d.ts`,
 * global augmentations): the program's roots are the shadows, so these would
 * be missing — and with them every ambient module/global they declare.
 */
function loadAmbientDeclarations(projectRoot: string, configPath?: string): string[] {
  try {
    const config = configPath ?? ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
    if (!config) return [];
    const parsed = ts.readConfigFile(config, ts.sys.readFile);
    if (parsed.error) return [];
    return ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(config)).fileNames.filter((name) => name.endsWith(".d.ts"));
  } catch {
    return [];
  }
}

/** The tsconfig's own sources (`.ts`, no declarations): `tsazor check`'s extra roots (includeProjectSources). */
function loadProjectSources(projectRoot: string, configPath?: string): string[] {
  try {
    const config = configPath ?? ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
    if (!config) return [];
    const parsed = ts.readConfigFile(config, ts.sys.readFile);
    if (parsed.error) return [];
    return ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(config)).fileNames.filter((name) => /\.(ts|tsx|mts|cts)$/.test(name) && !/\.d\.[mc]?ts$/.test(name));
  } catch {
    return [];
  }
}

function loadProjectOptions(projectRoot: string, configPath?: string): ts.CompilerOptions {
  const fallback = fallbackCompilerOptions();
  try {
    const config = configPath ?? ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
    if (!config) return fallback;
    const parsed = ts.readConfigFile(config, ts.sys.readFile);
    if (parsed.error) return fallback;
    const cmd = ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(config));
    return {
      ...fallback,
      ...cmd.options,
      // Non-negotiable for shadow modules and LSP responsiveness (the
      // runtime's decorators are standard ones; a legacy setting in the
      // project would type-check every @Parameter() as an error):
      experimentalDecorators: false,
      useDefineForClassFields: true,
      allowImportingTsExtensions: true,
      libReplacement: false,
      skipLibCheck: true,
      noEmit: true,
    };
  } catch {
    return fallback;
  }
}

/**
 * A peer lookup the host consults for shadow paths it does not own — with
 * per-app projects (2.5), a shadow imports another project's shadow
 * (`@tsazor/fluent` sources under a different tsconfig), and the language
 * service of *this* project must still see its content. The ProjectRegistry
 * provides the hook (over all its services).
 */
export interface ShadowLookup {
  entryOf(fileName: string): ShadowEntry | undefined;
}

export class TsazorTypeService {
  private readonly projectRoot: string;
  private readonly ls: ts.LanguageService;
  private readonly entries = new Map<string, ShadowEntry>();
  private readonly variants = new Map<string, VariantModule & { path: string }>();
  private nextVersion = 1;
  /** `.tsazor` keys currently building — cycle guard for the shadow cascade. */
  private readonly building = new Set<string>();
  private readonly lookup?: ShadowLookup;
  /** The tsconfig's .d.ts files — extra program roots next to the shadows. */
  private readonly ambientDeclarations: readonly string[];
  /** The tsconfig's `.ts` sources, roots too once `includeProjectSources` asked for them (`tsazor check`). */
  private projectSources: readonly string[] = [];
  private readonly configPath: string | undefined;

  /** The program's compiler options; `declarationOf` turns declaration emit on. */
  private options: ts.CompilerOptions;
  /** Whether `declarationOf` has turned declaration emit on (`noEmit` off) yet. */
  private emitsDeclarations = false;

  constructor(projectRoot: string, configPath?: string, lookup?: ShadowLookup) {
    this.projectRoot = path.resolve(projectRoot);
    this.lookup = lookup;
    this.configPath = configPath;
    this.options = loadProjectOptions(this.projectRoot, configPath);
    this.ambientDeclarations = loadAmbientDeclarations(this.projectRoot, configPath);
    this.ls = ts.createLanguageService(this.createHost());
  }

  /**
   * The declaration TypeScript emits for a real `.ts` source of the program, with the shadows in view: for a helper
   * whose declaration the file alone can't give (an inferred return type, a component's type through `./X.tsazor`)
   * — `tsazor build-lib`'s fallback. `errors` says why there is none.
   */
  declarationOf(fileName: string): { text?: string; errors: string[] } {
    // Always once, whatever the tsconfig says: its own `declaration: true` still left `noEmit` on, and nothing came out.
    if (!this.emitsDeclarations) {
      this.emitsDeclarations = true;
      this.options = { ...this.options, noEmit: false, declaration: true, emitDeclarationOnly: true, declarationMap: false, sourceMap: false, inlineSourceMap: false };
    }
    const program = this.ls.getProgram();
    const sourceFile = program?.getSourceFile(fileName);
    if (!program || !sourceFile) return { errors: ["not part of the project's program"] };
    const errors = program.getDeclarationDiagnostics(sourceFile).map((diagnostic) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return `(${line + 1},${character + 1}) TS${diagnostic.code}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
    });
    if (errors.length > 0) return { errors };
    const text = this.ls.getEmitOutput(fileName, true).outputFiles.find((file) => file.name.endsWith(".d.ts"))?.text;
    return text === undefined ? { errors: ["TypeScript emitted no declaration"] } : { text, errors: [] };
  }

  dispose(): void {
    this.ls.dispose();
  }

  /**
   * Makes every `.ts` source the tsconfig includes part of the program — not only those a component imports — so
   * `projectSourceFiles` covers a library's helpers that only its index exports (`tsazor check`; the editor
   * keeps the smaller program).
   */
  includeProjectSources(): void {
    this.projectSources = loadProjectSources(this.projectRoot, this.configPath);
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  /** Unified entry point: builds (and caches) the shadow for a .tsazor file.
   *  `source` (open document) wins over disk and always rebuilds — stale
   *  open-document shadows would freeze diagnostics at the first version;
   *  without it the file is read from disk and cached by mtime. */
  async ensureTsazor(tsazorPath: string, source?: string): Promise<ShadowEntry | null> {
    const key = shadowKey(tsazorPath);
    if (source !== undefined) return this.openTsazor(tsazorPath, source);
    let mtimeMs: number | undefined;
    try {
      mtimeMs = statSync(tsazorPath).mtimeMs;
    } catch {
      return null;
    }
    const cached = this.entries.get(key);
    if (cached && cached.mtimeMs === mtimeMs) return cached;
    try {
      const diskSource = readFileSync(tsazorPath, "utf8");
      return await this.openFromDisk(tsazorPath, diskSource, mtimeMs);
    } catch {
      return null;
    }
  }

  /** (Re)builds the shadow from an open document's source. */
  async openTsazor(tsazorPath: string, source: string): Promise<ShadowEntry | null> {
    return this.buildEntry(tsazorPath, source);
  }

  /** (Re)builds the shadow from disk, remembering the mtime for the cache. */
  private async openFromDisk(tsazorPath: string, source: string, mtimeMs: number): Promise<ShadowEntry | null> {
    return this.buildEntry(tsazorPath, source, mtimeMs);
  }

  /** Builds the shadow entry, running the `TItem` inference passes (2.4):
   *  pass one without resolved type arguments; per still-unresolved type
   *  parameter the attribute value's real type is queried from the shadow
   *  program and the shadow recompiled with the substitution (until no new
   *  tags resolve). The entry is registered provisionally on every pass —
   *  the program query needs the module in the registry. */
  private async buildEntry(tsazorPath: string, source: string, mtimeMs?: number): Promise<ShadowEntry | null> {
    const key = shadowKey(tsazorPath);
    if (this.building.has(key)) return this.entries.get(key) ?? null;
    this.building.add(key);
    try {
      let typeArguments: ReadonlyMap<string, ReadonlyMap<string, string>> | undefined;
      let entry: ShadowEntry | null = null;
      for (let pass = 0; pass < 4; pass++) {
        const shadow = await buildShadowModule(tsazorPath, source, this.projectRoot, typeArguments);
        if (!shadow) {
          this.entries.delete(key);
          return null;
        }
        entry = { shadow, version: this.nextVersion++, ...(mtimeMs !== undefined ? { mtimeMs } : {}) };
        this.entries.set(key, entry);
        const requests = shadow.typedInference ?? [];
        if (requests.length === 0) break;
        const resolved = this.inferTypeArguments(entry, requests);
        const fresh = [...resolved].filter(([tagId]) => typeArguments?.get(tagId) === undefined);
        if (fresh.length === 0) break;
        typeArguments = this.mergeTypeArguments(typeArguments, resolved);
      }
      // 2.4: shadows the graph reaches outside the project root (rewrite B —
      // bare-package components like `@tsazor/fluent`) must exist too, or the
      // consumer reports TS2307 for the package's `.tsazor.gen` shadow path.
      // (With per-app projects, the registry routes those to *their* project
      // and consults this entry's imported-tsazor edges.)
      if (entry) await this.ensureImportedShadows(entry);
      return entry;
    } finally {
      this.building.delete(key);
    }
  }

  /** Ensures shadows for every `.tsazor` component source the shadow imports
   *  by absolute or relative shadow path (`X.tsazor.gen`) — recursion stops
   *  at files already being built (cycles) or already registered. The edges
   *  stay on the entry (`importedTsazor`) for dependent re-checks (2.5). */
  private async ensureImportedShadows(entry: ShadowEntry): Promise<void> {
    const imported = importedTsazorOf(entry.shadow.code, entry.shadow.virtualPath);
    entry.importedTsazor = imported;
    await Promise.all(imported.map((candidate) => (existsSync(candidate) ? this.ensureTsazor(candidate) : Promise.resolve())));
  }

  /** Merges newly inferred tag type arguments into `previous` (later values win). */
  private mergeTypeArguments(
    previous: ReadonlyMap<string, ReadonlyMap<string, string>> | undefined,
    additions: ReadonlyMap<string, ReadonlyMap<string, string>>,
  ): ReadonlyMap<string, ReadonlyMap<string, string>> {
    if (previous === undefined) return additions;
    const merged = new Map(previous);
    for (const [tagId, args] of additions) merged.set(tagId, new Map([...(merged.get(tagId) ?? []), ...args]));
    return merged;
  }

  /** Resolves the requested type parameters from the shadow program: the
   *  attribute value's real type, unifying against the parameter's declared
   *  type — exactly (`Items: TItem`) or through the array element (`Items:
   *  TItem[]` ← `Person[]`) or the awaited type (`For: PromiseLike<T> | T`
   *  ← `Promise<User>`). Unresolvable requests stay absent. */
  private inferTypeArguments(entry: ShadowEntry, requests: readonly TypedTagInferenceRequest[]): Map<string, Map<string, string>> {
    const result = new Map<string, Map<string, string>>();
    const program = this.ls.getProgram();
    if (!program) return result;
    const sourceFile = program.getSourceFile(entry.shadow.virtualPath);
    if (!sourceFile) return result;
    const checker = program.getTypeChecker();

    for (const request of requests) {
      const gen = entry.shadow.map.srcToGen(request.value.line - 1, request.value.column);
      if (!gen) continue;
      const argument = inferTypeArgument(sourceFile, checker, offsetIn(entry.shadow.code, gen.line, gen.column), request);
      if (argument === undefined) continue;
      const args = result.get(request.tagId) ?? new Map<string, string>();
      args.set(request.typeParameter, argument);
      result.set(request.tagId, args);
    }
    return result;
  }

  /** Scans the project for every `.tsazor` file (T4) and builds its shadow
   *  — so types flow across files not currently open too. Returns the
   *  scanned file count. */
  async scanProject(): Promise<number> {
    const files = findTsazorFiles(this.projectRoot);
    for (const file of files) void this.ensureTsazor(file);
    return files.length;
  }

  closeTsazor(tsazorPath: string): void {
    this.entries.delete(shadowKey(tsazorPath));
  }

  /** Every currently registered entry (the registry walks these for
   *  dependent re-checks). */
  allEntries(): Array<{ file: string; entry: ShadowEntry }> {
    return [...this.entries.values()].map((entry) => ({ file: entry.shadow.realPath, entry }));
  }

  /** The shadow/graph entry behind a generated module path. Falls back to the
   *  registry lookup (2.5: cross-project shadow imports map their targets too). */
  entryOf(modulePath: string): ShadowEntry | undefined {
    return (
      this.entries.get(toKey(modulePath)) ??
      this.entries.get(toKey(modulePath + ".ts")) ??
      this.lookup?.entryOf(modulePath)
    );
  }

  /** Own entries only (the registry's lookup uses this to avoid cycles). */
  ownEntryOf(modulePath: string): ShadowEntry | undefined {
    return this.entries.get(toKey(modulePath)) ?? this.entries.get(toKey(modulePath + ".ts"));
  }

  mapOf(entry: ShadowEntry): TsazorGenMap {
    return entry.shadow.map;
  }

  /* ------------------------------------------------------------------ */
  /* Queries (generated/shadow coordinates — features translate)         */
  /* ------------------------------------------------------------------ */

  completionsOnShadow(entry: ShadowEntry, genLine0: number, genCol: number): ts.CompletionInfo | undefined {
    return this.ls.getCompletionsAtPosition(
      entry.shadow.virtualPath,
      offsetIn(entry.shadow.code, genLine0, genCol),
      // includeCompletionsWithInsertText carries prefix/suffix (e.g. `(…)`).
      { includeCompletionsForModuleExports: true, includeCompletionsWithInsertText: true },
    );
  }

  completionEntryDetail(
    entry: ShadowEntry,
    genLine0: number,
    genCol: number,
    entryName: string,
    source?: string,
  ): ts.CompletionEntryDetails | undefined {
    return this.ls.getCompletionEntryDetails(
      entry.shadow.virtualPath,
      offsetIn(entry.shadow.code, genLine0, genCol),
      entryName,
      undefined,
      source,
      undefined,
      undefined,
    );
  }

  quickInfoOnShadow(entry: ShadowEntry, genLine0: number, genCol: number): ts.QuickInfo | undefined {
    return this.ls.getQuickInfoAtPosition(entry.shadow.virtualPath, offsetIn(entry.shadow.code, genLine0, genCol));
  }

  definitionOnShadow(entry: ShadowEntry, genLine0: number, genCol: number): readonly ts.DefinitionInfo[] {
    return this.ls.getDefinitionAtPosition(entry.shadow.virtualPath, offsetIn(entry.shadow.code, genLine0, genCol)) ?? [];
  }

  semanticDiagnosticsOnShadow(entry: ShadowEntry): readonly ts.DiagnosticWithLocation[] {
    return this.ls.getSemanticDiagnostics(entry.shadow.virtualPath) as ts.DiagnosticWithLocation[];
  }

  /** TypeScript's own code fixes for a diagnostic span of the shadow (S4: "infer from usage"). */
  codeFixesOnShadow(entry: ShadowEntry, start: number, end: number, errorCodes: readonly number[]): readonly ts.CodeFixAction[] {
    try {
      return this.ls.getCodeFixesAtPosition(entry.shadow.virtualPath, start, end, errorCodes, {}, {});
    } catch {
      return [];
    }
  }

  /** Parse errors (e.g. from a typo like `private pass word`) come as
   *  syntactic diagnostics — a bucket the semantic query never includes. */
  syntacticDiagnosticsOnShadow(entry: ShadowEntry): readonly ts.DiagnosticWithLocation[] {
    return this.ls.getSyntacticDiagnostics(entry.shadow.virtualPath) as ts.DiagnosticWithLocation[];
  }

  /**
   * The real TypeScript sources the shadow graph pulls in below `root` —
   * code-behind classes (`X.tsazor.ts`) and the `.ts` modules they and the
   * markup import — without shadows, declaration files and node_modules.
   * Checked in the same program as the shadows, so `.tsazor` imports in them
   * resolve to the real component types (plain `tsc` only sees the ambient
   * `*.tsazor` declaration).
   */
  projectSourceFiles(root: string): string[] {
    const program = this.ls.getProgram();
    if (!program) return [];
    const prefix = `${path.resolve(root).replace(/\\/g, "/").toLowerCase()}/`;
    return program
      .getSourceFiles()
      .map((file) => file.fileName)
      .filter((name) => {
        const normalized = name.replace(/\\/g, "/");
        return (
          normalized.toLowerCase().startsWith(prefix) &&
          !normalized.includes("/node_modules/") &&
          !normalized.endsWith(".d.ts") &&
          !normalized.endsWith(".tsazor.gen.ts") &&
          /\.(ts|tsx|mts|cts)$/.test(normalized)
        );
      });
  }

  /** Syntactic + semantic diagnostics of a real source file of the program, with 0-based positions. */
  sourceFileDiagnostics(fileName: string): { line: number; character: number; code: number; message: string }[] {
    const program = this.ls.getProgram();
    const sourceFile = program?.getSourceFile(fileName);
    if (!sourceFile) return [];
    const diagnostics = [...this.ls.getSyntacticDiagnostics(fileName), ...this.ls.getSemanticDiagnostics(fileName)];
    return diagnostics.map((diagnostic) => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      return { line, character, code: diagnostic.code, message: ts.flattenDiagnosticMessageText(diagnostic.messageText, " ") };
    });
  }

  /**
   * Builds a one-request variant shadow from a patched .tsazor source and
   * computes the query cursor at the end of the baked `this.<chain>` text.
   */
  async buildVariant(
    entry: ShadowEntry,
    source: string,
    patch: SourcePatch,
  ): Promise<{ entry: ShadowEntry; cursor: GenPosition } | null> {
    const lines = source.split("\n");
    if (patch.line >= lines.length) return null;
    const line = lines[patch.line]!;
    const variantSource = [
      ...lines.slice(0, patch.line),
      line.slice(0, patch.start) + patch.replacement + line.slice(patch.end),
      ...lines.slice(patch.line + 1),
    ].join("\n");
    const shadow = await buildShadowModule(entry.shadow.realPath, variantSource, this.projectRoot);
    if (!shadow) return null;
    // The cursor anchors on the VARIANT's own map: its synthetic `this.` token
    // carries the patch.start source column, so the anchor lands on the chain.
    const anchor = shadow.map.srcToGen(patch.line, patch.start);
    if (!anchor) return null;
    const variantPath = `${entry.shadow.virtualPath}.variant.ts`;
    // Queries must address the VARIANT module — the original shadow path still
    // resolves to the unpatched entry in the registry.
    const variantEntry: ShadowEntry = {
      shadow: { ...shadow, virtualPath: variantPath },
      version: this.nextVersion++,
    };
    this.variants.set(toKey(variantPath), { code: shadow.code, version: variantEntry.version, path: variantPath });
    // Cursor at the end of the baked needle: the generated anchor line
    // contains it exactly (`b.addContent(…, this.<chain>.)`); of its
    // occurrences take the one nearest the mapped anchor position. 1:1
    // replacements fall back to anchor + replacement length.
    const lineText = variantEntry.shadow.code.split("\n")[anchor.line] ?? "";
    const needle = patch.cursorAfter ?? patch.replacement;
    const positions: number[] = [];
    for (let at = lineText.indexOf(needle); at >= 0; at = lineText.indexOf(needle, at + 1)) {
      positions.push(at);
    }
    const column =
      positions.length > 0
        ? positions.reduce(
            (best, p) => (Math.abs(p - anchor.column) < Math.abs(best - anchor.column) ? p : best),
            positions[0]!,
          ) + needle.length
        : anchor.column + patch.replacement.length;
    // Query at the end of the baked anchor (`this.<prefix>⌷`).
    return {
      entry: variantEntry,
      cursor: { line: anchor.line, column },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Host                                                                */
  /* ------------------------------------------------------------------ */

  private createHost(): ts.LanguageServiceHost {
    const options = this.options;
    const base: ts.LanguageServiceHost = {
      getCompilationSettings: () => this.options,
      getScriptFileNames: () => [
        ...this.ambientDeclarations,
        ...this.projectSources,
        ...[...this.entries.values()].map((entry) => entry.shadow.virtualPath),
        ...[...this.variants.values()].map((v) => v.path),
      ],
      getScriptVersion: (fileName) => String(this.versionOf(fileName)),
      getScriptSnapshot: (fileName) => {
        const code = this.snapshotCode(fileName);
        return code === undefined ? undefined : ts.ScriptSnapshot.fromString(code);
      },
      getCurrentDirectory: () => this.projectRoot,
      getDefaultLibFileName: () => path.join(resolveLibDir(), path.basename(ts.getDefaultLibFileName({}))),
      fileExists: (fileName) => this.exists(fileName),
      readFile: (fileName) => this.snapshotCode(fileName) ?? undefined,
      readDirectory: (dir, extensions, excludes, includes, depth) =>
        ts.sys.readDirectory(dir, extensions, excludes, includes, depth),
      getDirectories: (dir) => ts.sys.getDirectories(dir),
      directoryExists: (dir) => ts.sys.directoryExists(dir),
      getNewLine: () => "\n",
    };
    // TS itself calls these even though the public LanguageServiceHost type
    // omits them (observed at createProgram time); on Windows, case-folded
    // canonical names keep the lowercase shadow-registry keys consistent.
    const moduleHost: ts.ModuleResolutionHost = {
      fileExists: (fileName) => this.exists(fileName),
      readFile: (fileName) => this.snapshotCode(fileName) ?? undefined,
      directoryExists: (dir) => ts.sys.directoryExists(dir),
      getDirectories: (dir) => ts.sys.getDirectories(dir),
      realpath: ts.sys.realpath,
    };
    // Shadows register incrementally: a miss cached before a sibling shadow
    // existed would stick, so the cache is dropped whenever the set of
    // registered modules changed.
    const resolutionCache = ts.createModuleResolutionCache(this.projectRoot, (name) => name.toLowerCase(), options);
    let registeredModules = -1;
    const currentCache = (): ts.ModuleResolutionCache => {
      const count = this.entries.size + this.variants.size;
      if (count !== registeredModules) {
        registeredModules = count;
        resolutionCache.clear();
      }
      return resolutionCache;
    };
    return {
      ...base,
      // A real .ts source (code-behind, a service) importing a component —
      // `import type Child from "./Child.tsazor"` for a typed @ref — resolves
      // to the component's shadow, as the shadows' own imports do; otherwise
      // only the ambient `*.tsazor` declaration (a ComponentType value) is
      // seen and the class cannot be used as a type.
      resolveModuleNameLiterals: (literals, containingFile, redirectedReference, compilerOptions, containingSourceFile) =>
        literals.map((literal) => {
          const name = literal.text;
          if (name.endsWith(".tsazor") && name.startsWith(".") && !isShadowPath(containingFile)) {
            const shadow = shadowPathFor(path.resolve(path.dirname(containingFile), name));
            if (this.exists(shadow)) {
              return { resolvedModule: { resolvedFileName: shadow, extension: ts.Extension.Ts, isExternalLibraryImport: false } };
            }
          }
          // A shadow's import of another component's shadow (`./Icon.tsazor.gen`, written without an extension):
          // resolved here, as `bundler` would — `nodenext` requires the extension of a relative ESM import (TS2307).
          if (name.endsWith(".gen") && name.startsWith(".")) {
            const shadow = `${path.resolve(path.dirname(containingFile), name)}.ts`;
            if (this.exists(shadow)) {
              return { resolvedModule: { resolvedFileName: shadow, extension: ts.Extension.Ts, isExternalLibraryImport: false } };
            }
          }
          return ts.resolveModuleName(
            name,
            containingFile,
            compilerOptions,
            moduleHost,
            currentCache(),
            redirectedReference,
            ts.getModeForUsageLocation(containingSourceFile, literal, compilerOptions),
          );
        }),
      // getDefaultLibLocation is also off the public type but read by
      // createProgram (defaultLibraryPath honors it before the fallback).
      getDefaultLibLocation: () => resolveLibDir(),
      useCaseSensitiveFileNames: () => false,
      getCanonicalFileName: (fileName: string) => fileName.toLowerCase(),
    } as ts.LanguageServiceHost;
  }

  private versionOf(fileName: string): number {
    const key = toKey(fileName);
    const variant = this.variants.get(key);
    if (variant) return variant.version;
    const entry = this.entries.get(key) ?? this.entries.get(key.replace(/\.variant\.ts$/, ".tsazor.gen.ts"));
    if (entry) return entry.version;
    // A peer project's shadow: its mtime stands (the registry keeps entries
    // current, the program rebuilds when the stamp moves).
    if (isShadowPath(fileName) && this.lookup?.entryOf(fileName)) return this.lookup.entryOf(fileName)!.version;
    try {
      return statSync(fileName).mtimeMs;
    } catch {
      return 0;
    }
  }

  private exists(fileName: string): boolean {
    const key = toKey(fileName);
    if (this.variants.has(key) || this.entries.has(key)) return true;
    if (isShadowPath(fileName)) return this.lookup?.entryOf(fileName) !== undefined;
    return existsSync(fileName);
  }

  /** Source text for any file of the program: shadows, variants, real files. */
  private snapshotCode(fileName: string): string | undefined {
    const key = toKey(fileName);
    const variant = this.variants.get(key);
    if (variant) return variant.code;
    const entry = this.entries.get(key);
    if (entry) return entry.shadow.code;
    if (isShadowPath(fileName)) {
      const peer = this.lookup?.entryOf(fileName);
      return peer?.shadow.code;
    }
    try {
      return readFileSync(fileName, "utf8");
    } catch {
      return undefined;
    }
  }
}

/* Registry helpers -------------------------------------------------------- */

/** The .tsazor files a shadow imports (specifier → absolute .tsazor path):
 *  relative `./X.tsazor.gen` specifiers resolve next to the shadow module,
 *  absolute ones (rewrite B, package shadows) pass through as written. */
export function importedTsazorOf(shadowCode: string, virtualPath: string): string[] {
  const fileDir = path.dirname(virtualPath);
  const imported = new Set<string>();
  for (const match of shadowCode.matchAll(/from\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (specifier === undefined) continue;
    // Windows path.resolve turns "D:/a/x.tsazor.gen" and "./x.tsazor.gen" alike.
    const resolved = path.resolve(fileDir, specifier.replace(/\\/g, "/"));
    if (/\.tsazor\.gen(\.ts)?$/.test(resolved)) imported.add(resolved.replace(/\.gen(\.ts)?$/, ""));
  }
  return [...imported];
}

/** Every `.tsazor` under `root` in source-tree order (node_modules, .git,
 *  dist/bin/obj excluded) — the T4 project scan and `tsazor check` share it. */
export function findTsazorFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    names.sort();
    for (const name of names) {
      if (name === "node_modules" || name === ".git" || name === "dist" || name === "bin" || name === "obj") continue;
      const entry = path.join(dir, name);
      let stat;
      try {
        stat = statSync(entry);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(entry);
      else if (name.endsWith(".tsazor")) files.push(entry);
    }
  };
  walk(path.resolve(root));
  return files;
}

function shadowKey(tsazorPath: string): string {
  return toKey(shadowPathFor(tsazorPath));
}

/** 0-based line/column → text offset inside a generated module's code. */
function offsetIn(code: string, line0: number, col: number): number {
  let offset = 0;
  let line = 0;
  while (line < line0) {
    const nl = code.indexOf("\n", offset);
    if (nl < 0) return code.length;
    offset = nl + 1;
    line++;
  }
  return offset + col;
}

/** Text offset inside a generated module → 0-based line/column. */
export function shadowOffsetToPos(code: string, offset: number): GenPosition {
  const clamped = Math.max(0, Math.min(offset, code.length));
  const line0 = clamped === 0 ? 0 : (code.slice(0, clamped).match(/\n/g) ?? []).length;
  const lineStart = clamped === 0 ? 0 : code.lastIndexOf("\n", clamped - 1) + 1;
  return { line: line0, column: clamped - lineStart };
}