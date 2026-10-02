/**
 * The tutorial's `tsazor check`: the type layer of the language server
 * (packages/lsp — shadow modules + a TypeScript language service), rebuilt
 * over an in-memory file system so it runs in the compile worker and in the
 * headless gate test alike. Pure — no DOM, no Node APIs.
 *
 *   X.tsazor   → compile() with `typedShadow` → /app/X.tsazor.gen.ts (shadow)
 *   X.ts       → /app/X.ts (also code-behind X.tsazor.ts)
 *   types      → /lib/lib.*.d.ts + /node_modules/@tsazor/{runtime,components}
 *
 * Diagnostics are mapped back through the compiler's raw mappings
 * (TsazorGenMap, the LSP's own class); diagnostics in unmapped generated
 * plumbing are dropped, exactly like `tsDiagnostics` in the LSP.
 */
import { compile, type TypedTagInferenceRequest } from "@tsazor/compiler";
import { TsazorGenMap } from "@tsazor/lsp/ts-mapping";
import ts from "typescript";
import { basename, createResolver, dirname, joinPath, relativeSpecifier } from "./resolve.js";
import { APP_ROOT, LIB_ROOT, type TypeEnvironment } from "./type-paths.js";
import type { Diagnostic, Files } from "./types.js";

export { APP_ROOT, LIB_ROOT, type TypeEnvironment };

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  target: ts.ScriptTarget.ES2022,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  experimentalDecorators: false,
  useDefineForClassFields: true,
  skipLibCheck: true,
  libReplacement: false,
  noEmit: true,
};

interface ShadowEntry {
  /** Project file the shadow belongs to (`App.tsazor`). */
  file: string;
  map: TsazorGenMap;
  code: string;
  /** `TItem` inference requests of generic component tags (2.4). */
  requests: readonly TypedTagInferenceRequest[];
  /** Type arguments inferred so far, per tag (`line:column`). */
  typeArguments?: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

type TypeArguments = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** A long-lived checker: the language service keeps the parsed lib files between checks. */
export class TypeChecker {
  private readonly env: Map<string, string>;
  private readonly directories = new Set<string>();
  private scripts = new Map<string, { text: string; version: number }>();
  private shadows = new Map<string, ShadowEntry>();
  private readonly service: ts.LanguageService;

  constructor(environment: TypeEnvironment) {
    this.env = new Map(Object.entries(environment));
    for (const file of this.env.keys()) this.addDirectories(file);
    const host: ts.LanguageServiceHost = {
      getCompilationSettings: () => OPTIONS,
      getScriptFileNames: () => [...this.scripts.keys()],
      getScriptVersion: (file) => String(this.scripts.get(file)?.version ?? 0),
      getScriptSnapshot: (file) => {
        const text = this.read(file);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => APP_ROOT,
      getDefaultLibFileName: (options) => `${LIB_ROOT}${ts.getDefaultLibFileName(options)}`,
      fileExists: (file) => this.read(file) !== undefined,
      readFile: (file) => this.read(file),
      directoryExists: (dir) => this.directories.has(dir.replace(/\/$/, "")),
      getDirectories: () => [],
      realpath: (file) => file,
      useCaseSensitiveFileNames: () => true,
      // `import App from "./App.tsazor"` in a plain .ts file (Program.ts, a
      // code-behind) → the component's shadow; everything else as usual.
      resolveModuleNameLiterals: (literals, containingFile, _redirect, options) =>
        literals.map((literal) => {
          const specifier = literal.text;
          if (specifier.startsWith(".") && specifier.endsWith(".tsazor")) {
            const shadow = `${joinPath(dirname(containingFile), specifier)}.gen.ts`.replace(/^(?!\/)/, "/");
            if (this.scripts.has(shadow)) return { resolvedModule: { resolvedFileName: shadow, extension: ts.Extension.Ts, isExternalLibraryImport: false } };
          }
          return ts.resolveModuleName(specifier, containingFile, options, host);
        }),
    };
    this.service = ts.createLanguageService(host, ts.createDocumentRegistry(true, APP_ROOT));
  }

  /** Type diagnostics of the project (compiler diagnostics are the build's job). */
  check(files: Files): Diagnostic[] {
    this.update(files);
    this.inferTypeArguments(files);
    const program = this.service.getProgram();
    if (!program) return [];
    const results: Diagnostic[] = [];
    for (const [path] of this.scripts) {
      const sourceFile = program.getSourceFile(path);
      if (!sourceFile) continue;
      const diagnostics = [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)];
      const shadow = this.shadows.get(path);
      const parameterSpans = shadow ? parameterPropertySpans(sourceFile) : [];
      for (const diagnostic of diagnostics) {
        if (diagnostic.start === undefined) continue;
        const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        // Shadow false positives (as in the LSP): asset imports, and parameters
        // without initializer (the renderer assigns them).
        if (diagnostic.code === 2307 && /\.(css|svg|png|jpe?g|gif|webp|woff2?)['"]/.test(message)) continue;
        if (diagnostic.code === 2564 && parameterSpans.some((span) => diagnostic.start! >= span.start && diagnostic.start! < span.end)) continue;
        const span = shadow && diagnostic.code === 1360 ? satisfiedValueSpan(shadow.code, diagnostic.start) : undefined;
        const located = shadow
          ? mapShadow(sourceFile, shadow, span?.start ?? diagnostic.start, span?.length ?? diagnostic.length ?? 1)
          : mapPlain(sourceFile, path.slice(APP_ROOT.length), diagnostic.start, diagnostic.length ?? 1);
        if (!located) continue;
        results.push({
          ...located,
          severity: diagnostic.category === ts.DiagnosticCategory.Error ? "error" : "warning",
          code: `TS${diagnostic.code}`,
          message,
          source: "types",
        });
      }
    }
    return results.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
  }

  private read(file: string): string | undefined {
    return this.scripts.get(file)?.text ?? this.env.get(file);
  }

  private addDirectories(file: string): void {
    for (let dir = file.slice(0, file.lastIndexOf("/")); dir.length > 0; dir = dir.slice(0, dir.lastIndexOf("/"))) {
      if (this.directories.has(dir)) break;
      this.directories.add(dir);
    }
  }

  /**
   * The LSP's `TItem` inference (2.4, ts-service `buildEntry`): a generic
   * component tag whose type parameter the compiler could not resolve asks
   * for the real type of an attribute value (`items="@todos"` → `Todo[]`);
   * the program answers, the shadow is rebuilt with the type argument —
   * until no new tag resolves.
   */
  private inferTypeArguments(files: Files): void {
    const resolver = createResolver(files);
    for (let pass = 0; pass < 3; pass++) {
      const program = this.service.getProgram();
      if (!program) return;
      const checker = program.getTypeChecker();
      let changed = false;
      for (const [path, entry] of this.shadows) {
        if (entry.requests.length === 0) continue;
        const sourceFile = program.getSourceFile(path);
        if (!sourceFile) continue;
        const resolved = inferRequests(sourceFile, checker, entry);
        const fresh = [...resolved].filter(([tagId]) => entry.typeArguments?.get(tagId) === undefined);
        if (fresh.length === 0) continue;
        const merged = new Map(entry.typeArguments ?? []);
        for (const [tagId, args] of resolved) merged.set(tagId, new Map([...(merged.get(tagId) ?? []), ...args]));
        const shadow = buildShadow(files, entry.file, resolver, merged);
        if (!shadow) continue;
        const previous = this.scripts.get(path)!;
        this.scripts.set(path, { text: shadow.code, version: previous.version + 1 });
        this.shadows.set(path, { file: entry.file, map: shadow.map, code: shadow.code, requests: shadow.requests, typeArguments: merged });
        changed = true;
      }
      if (!changed) return;
    }
  }

  /** Rebuilds the script set: shadows of every component, plain .ts files as they are. */
  private update(files: Files): void {
    const resolver = createResolver(files);
    const next = new Map<string, { text: string; version: number }>();
    const shadows = new Map<string, ShadowEntry>();
    const put = (path: string, text: string): void => {
      const previous = this.scripts.get(path);
      next.set(path, { text, version: previous && previous.text === text ? previous.version : (previous?.version ?? 0) + 1 });
      this.addDirectories(path);
    };
    for (const file of Object.keys(files).sort()) {
      const source = files[file]!;
      if (file.endsWith(".ts")) {
        put(`${APP_ROOT}${file}`, source);
      } else if (file.endsWith(".tsazor") && basename(file) !== "_Imports.tsazor") {
        const shadow = buildShadow(files, file, resolver);
        if (!shadow) continue;
        const path = `${APP_ROOT}${file}.gen.ts`;
        put(path, shadow.code);
        shadows.set(path, { file, map: shadow.map, code: shadow.code, requests: shadow.requests });
      }
    }
    this.scripts = next;
    this.shadows = shadows;
  }
}

/** The shadow module of one component, or null when the compiler rejects the file. */
function buildShadow(
  files: Files,
  file: string,
  resolver: ReturnType<typeof createResolver>,
  typeArguments?: TypeArguments,
): { code: string; map: TsazorGenMap; requests: readonly TypedTagInferenceRequest[] } | null {
  const fileDir = dirname(file);
  const options = resolver.optionsFor(file);
  const codeBehindFile = `${file}.ts`;
  const codeBehindClass = codeBehindFile in files ? `${options.className}Base` : undefined;
  let compiled: ReturnType<typeof compile>;
  try {
    compiled = compile(files[file]!, {
      ...options,
      imports: codeBehindClass ? [`import ${codeBehindClass} from "./${basename(codeBehindFile)}";`] : [],
      ...(codeBehindClass ? { codeBehindClass, codeBehindSource: files[codeBehindFile] } : {}),
      typedShadow: {
        rebaseTypeImport: (reference) => {
          if (reference.specifier === undefined) return undefined;
          if (!reference.specifier.startsWith(".")) return reference.specifier;
          if (reference.file === undefined) return undefined;
          return relativeSpecifier(fileDir, joinPath(dirname(reference.file), reference.specifier));
        },
        ...(typeArguments ? { typeArguments } : {}),
      },
    });
  } catch {
    return null;
  }
  if (compiled.diagnostics.hasErrors) return null;
  // Imports of sibling components → their shadows (the LSP's rewrite A).
  const code = compiled.code.replace(/^(import\s[^;]*?\sfrom\s+)(["'])(\.{1,2}\/[^"']*?\.tsazor)\2/gm, "$1$2$3.gen$2");
  return { code, map: new TsazorGenMap(compiled.mappings ?? []), requests: compiled.typedInference ?? [] };
}

/** One inference pass over a shadow (the LSP's `inferTypeArguments`): exact (`T`) or through the array element (`T[]`). */
function inferRequests(sourceFile: ts.SourceFile, checker: ts.TypeChecker, entry: ShadowEntry): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  for (const request of entry.requests) {
    const gen = entry.map.srcToGen(request.value.line - 1, request.value.column);
    if (!gen) continue;
    const offset = sourceFile.getPositionOfLineAndCharacter(gen.line, gen.column);
    if (offset >= sourceFile.text.length) continue;
    // The outermost expression starting at the value's position is the attribute value.
    let node: ts.Node = descendTo(sourceFile, offset);
    while (node.parent !== undefined && ts.isExpression(node.parent) && node.parent.getStart(sourceFile) === node.getStart(sourceFile)) node = node.parent;
    const type = checker.getTypeAtLocation(node);
    const declared = request.parameterType.trim();
    let argument: string | undefined;
    if (declared === request.typeParameter) {
      argument = checker.typeToString(type, node, ts.TypeFormatFlags.NoTruncation);
    } else if (declared.endsWith("[]") && declared.slice(0, -2).trim() === request.typeParameter && checker.isArrayType(type)) {
      const [item] = checker.getTypeArguments(type as ts.TypeReference);
      if (item !== undefined) argument = checker.typeToString(item, node, ts.TypeFormatFlags.NoTruncation);
    }
    if (argument === undefined || argument.trim().length === 0) continue;
    const args = result.get(request.tagId) ?? new Map<string, string>();
    args.set(request.typeParameter, argument);
    result.set(request.tagId, args);
  }
  return result;
}

function descendTo(sourceFile: ts.SourceFile, offset: number): ts.Node {
  let current: ts.Node = sourceFile;
  for (;;) {
    const next = current.getChildren(sourceFile).find((child) => child.getStart(sourceFile) <= offset && offset < child.getEnd());
    if (next === undefined) return current;
    current = next;
  }
}

type Located = Pick<Diagnostic, "file" | "line" | "column" | "endLine" | "endColumn">;

function mapShadow(sourceFile: ts.SourceFile, shadow: ShadowEntry, start: number, length: number): Located | undefined {
  const startPos = sourceFile.getLineAndCharacterOfPosition(start);
  const src = shadow.map.genToSrc(startPos.line, startPos.character);
  if (!src) return undefined;
  const endPos = sourceFile.getLineAndCharacterOfPosition(start + length);
  const srcEnd = shadow.map.genToSrc(endPos.line, endPos.character);
  const after = srcEnd && (srcEnd.line > src.line || srcEnd.character > src.character);
  return {
    file: shadow.file,
    line: src.line + 1,
    column: src.character,
    endLine: (after ? srcEnd.line : src.line) + 1,
    endColumn: after ? srcEnd.character : src.character + 1,
  };
}

function mapPlain(sourceFile: ts.SourceFile, file: string, start: number, length: number): Located {
  const from = sourceFile.getLineAndCharacterOfPosition(start);
  const to = sourceFile.getLineAndCharacterOfPosition(start + length);
  return { file, line: from.line + 1, column: from.character, endLine: to.line + 1, endColumn: to.character };
}

/**
 * TS1360 ("does not satisfy") sits on the type of the shadow's
 * `(value) satisfies T` check, which has no source of its own — report it
 * from the attribute statement's start (mapped to the attribute name) to the
 * end of the value (mapped through the value's tokens).
 */
function satisfiedValueSpan(code: string, start: number): { start: number; length: number } | undefined {
  const close = code.lastIndexOf(") satisfies ", start);
  if (close < 0) return undefined;
  const lineStart = code.lastIndexOf("\n", close) + 1;
  const statement = lineStart + (/^\s*/.exec(code.slice(lineStart))?.[0].length ?? 0);
  return { start: statement, length: close - statement };
}

/** Spans of `@Parameter`-decorated properties (TS2564 does not apply to them). */
function parameterPropertySpans(sourceFile: ts.SourceFile): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyDeclaration(node) && (ts.getDecorators(node) ?? []).some((d) => /^(Parameter|CascadingParameter)\b/.test(d.expression.getText(sourceFile)))) {
      spans.push({ start: node.getStart(sourceFile), end: node.end });
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);
  return spans;
}
