import { buildShadowModule, isShadowPath, shadowPathFor, type ShadowModule } from "./shadow-module";
import { TazorGenMap } from "./ts-mapping";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ts from "typescript";

/**
 * The TypeScript type layer (v2): one `ts.LanguageService` per workspace over
 * shadow modules (`<dir>/<Name>.tazor.gen.ts`, virtual) plus every real file
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
  /** .tazor mtime when built from disk (on-demand cache for closed files). */
  mtimeMs?: number;
}

/** A single-line .tazor patch producing the completion anchor (`this.<prefix>`). */
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
    // The generated code imports the real sidecar as `./X.tazor.ts`.
    allowImportingTsExtensions: true,
    experimentalDecorators: true,
    useDefineForClassFields: false,
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
  if (process.env.TASOR_TS_LIB_DIR) return path.resolve(process.env.TASOR_TS_LIB_DIR);
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

function loadProjectOptions(projectRoot: string): ts.CompilerOptions {
  const fallback = fallbackCompilerOptions();
  try {
    const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
    if (!configPath) return fallback;
    const parsed = ts.readConfigFile(configPath, ts.sys.readFile);
    if (parsed.error) return fallback;
    const cmd = ts.parseJsonConfigFileContent(parsed.config, ts.sys, path.dirname(configPath));
    return {
      ...fallback,
      ...cmd.options,
      // Non-negotiable for shadow modules and LSP responsiveness:
      experimentalDecorators: true,
      useDefineForClassFields: false,
      allowImportingTsExtensions: true,
      libReplacement: false,
      skipLibCheck: true,
      noEmit: true,
    };
  } catch {
    return fallback;
  }
}

export class TasorTypeService {
  private readonly projectRoot: string;
  private readonly ls: ts.LanguageService;
  private readonly entries = new Map<string, ShadowEntry>();
  private readonly variants = new Map<string, VariantModule & { path: string }>();
  private nextVersion = 1;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    const options = loadProjectOptions(this.projectRoot);
    this.ls = ts.createLanguageService(this.createHost(options));
  }

  dispose(): void {
    this.ls.dispose();
  }

  /* ------------------------------------------------------------------ */
  /* Lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  /** Unified entry point: builds (and caches) the shadow for a .tazor file.
   *  `source` (open document) wins over disk; without it the file is read
   *  from disk and cached by mtime. */
  async ensureTazor(tazorPath: string, source?: string): Promise<ShadowEntry | null> {
    const key = shadowKey(tazorPath);
    if (source !== undefined) {
      const cached = this.entries.get(key);
      if (cached?.mtimeMs === undefined && cached) return cached; // open doc wins
      return this.openTazor(tazorPath, source);
    }
    let mtimeMs: number | undefined;
    try {
      mtimeMs = statSync(tazorPath).mtimeMs;
    } catch {
      return null;
    }
    const cached = this.entries.get(key);
    if (cached && cached.mtimeMs === mtimeMs) return cached;
    if (cached?.mtimeMs === undefined && cached) return cached; // open doc wins
    try {
      const diskSource = readFileSync(tazorPath, "utf8");
      return await this.openFromDisk(tazorPath, diskSource, mtimeMs);
    } catch {
      return null;
    }
  }

  /** (Re)builds the shadow from an open document's source. */
  async openTazor(tazorPath: string, source: string): Promise<ShadowEntry | null> {
    const key = shadowKey(tazorPath);
    const shadow = await buildShadowModule(tazorPath, source, this.projectRoot);
    if (!shadow) {
      this.entries.delete(key);
      return null;
    }
    const entry: ShadowEntry = { shadow, version: this.nextVersion++ };
    this.entries.set(key, entry);
    return entry;
  }

  /** (Re)builds the shadow from disk, remembering the mtime for the cache. */
  private async openFromDisk(tazorPath: string, source: string, mtimeMs: number): Promise<ShadowEntry | null> {
    const key = shadowKey(tazorPath);
    const shadow = await buildShadowModule(tazorPath, source, this.projectRoot);
    if (!shadow) {
      this.entries.delete(key);
      return null;
    }
    const entry: ShadowEntry = { shadow, version: this.nextVersion++, mtimeMs };
    this.entries.set(key, entry);
    return entry;
  }

  closeTazor(tazorPath: string): void {
    this.entries.delete(shadowKey(tazorPath));
  }

  /** The shadow/graph entry behind a generated module path. */
  entryOf(modulePath: string): ShadowEntry | undefined {
    return this.entries.get(toKey(modulePath)) ?? this.entries.get(toKey(modulePath + ".ts"));
  }

  mapOf(entry: ShadowEntry): TazorGenMap {
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

  /** Parse errors (e.g. from a typo like `private pass word`) come as
   *  syntactic diagnostics — a bucket the semantic query never includes. */
  syntacticDiagnosticsOnShadow(entry: ShadowEntry): readonly ts.DiagnosticWithLocation[] {
    return this.ls.getSyntacticDiagnostics(entry.shadow.virtualPath) as ts.DiagnosticWithLocation[];
  }

  /**
   * Builds a one-request variant shadow from a patched .tazor source and
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

  private createHost(options: ts.CompilerOptions): ts.LanguageServiceHost {
    const base: ts.LanguageServiceHost = {
      getCompilationSettings: () => options,
      getScriptFileNames: () => [
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
    return {
      ...base,
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
    const entry = this.entries.get(key) ?? this.entries.get(key.replace(/\.variant\.ts$/, ".tazor.gen.ts"));
    if (entry) return entry.version;
    try {
      return statSync(fileName).mtimeMs;
    } catch {
      return 0;
    }
  }

  private exists(fileName: string): boolean {
    const key = toKey(fileName);
    if (this.variants.has(key) || this.entries.has(key)) return true;
    return existsSync(fileName);
  }

  /** Source text for any file of the program: shadows, variants, real files. */
  private snapshotCode(fileName: string): string | undefined {
    const key = toKey(fileName);
    const variant = this.variants.get(key);
    if (variant) return variant.code;
    const entry = this.entries.get(key);
    if (entry) return entry.shadow.code;
    if (isShadowPath(fileName)) return undefined;
    try {
      return readFileSync(fileName, "utf8");
    } catch {
      return undefined;
    }
  }
}

/* Registry helpers -------------------------------------------------------- */

function shadowKey(tazorPath: string): string {
  return toKey(shadowPathFor(tazorPath));
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