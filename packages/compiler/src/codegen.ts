import type {
  AttributeNode,
  CodeBlockNode,
  DocumentNode,
  ElementNode,
  MarkupNode,
} from "./ast";
import { DiagnosticBag, type SourcePos } from "./diagnostics";
import { decodeHtmlEntities } from "./entities";
import { TSScanner } from "./scanner";

export interface ResolvedComponent {
  specifier: string;
  /** Exported name; undefined = default export. */
  exportName?: string;
}

export interface ResolvedType {
  specifier: string;
  exportName?: string;
}

export interface CodegenOptions {
  className: string;
  /** Resolves an uppercase markup tag to its module. */
  resolveComponent?: (tagName: string, usings: string[]) => ResolvedComponent | null;
  /** Resolves an identifier (@inject type, @inherits base) to its module. */
  resolveType?: (name: string, usings: string[]) => ResolvedType | null;
  /** Extra import lines (e.g. composed from _Imports.tazor). */
  imports?: string[];
  /** Map of usings to emit as plain module imports (namespace → specifier). */
  usingSpecifiers?: Record<string, string>;
  /** Extra module-level identifiers (imported enums/values) that must not be baked to this.*. */
  knownGlobals?: ReadonlySet<string>;
  /** Source file name used in the sourcemap. */
  fileName?: string;
  /**
   * Full scope attribute name (e.g. "b-1a2b3c4d") for scoped CSS. When set,
   * every emitted plain DOM element gets this attribute first; components are
   * left alone (Blazor behavior). Unset → byte-identical emission as before.
   */
  scopeHash?: string;
  /**
   * Class name of the default export of the sibling `X.tazor.ts` (code-behind).
   * When set, the generated class extends it — the code-behind class itself
   * declares its own base (usually ComponentBase). Takes precedence over
   * @inherits; a conflicting @inherits emits a TZR011 warning. Unset →
   * byte-identical emission as before.
   */
  codeBehindClass?: string;
}

export interface CodegenResult {
  code: string;
  mappings: Array<{ genLine: number; genCol: number; srcLine: number; srcCol: number }>;
  metadata: {
    routeTemplate?: string;
    layout?: string;
    /** Bare @authorize directive on a @page → authentication-required route. */
    authorize?: boolean;
    usings: string[];
    injects: Array<{ type: string; name: string }>;
    typeParams: string[];
    inherits?: string;
    /** Echo of options.scopeHash (scoped-CSS attribute name), when set. */
    scopeHash?: string;
    /** Echo of options.codeBehindClass (sibling X.tazor.ts base class), when set. */
    codeBehindClass?: string;
  };
}

interface MapEntry {
  genLine: number;
  genCol: number;
  srcLine: number;
  srcCol: number;
}

/** Component attributes whose name marks them as event callbacks (On*, on*). */
const EVENT_ATTR_PATTERN = /^on/i;

/** Emission context: tracks sequence numbers per fragment scope. */
interface SeqScope {
  next: number;
}

/** TS globals (and keywords) that must not be turned into member references. */
const KNOWN_GLOBALS = new Set([
  "this", "Math", "JSON", "Date", "Number", "String", "Boolean", "Array", "Object", "Promise",
  "Map", "Set", "Symbol", "WeakMap", "WeakSet", "Intl", "Reflect", "Proxy", "RegExp", "Error",
  "console", "window", "document", "location", "navigator", "undefined", "NaN", "Infinity",
  "super", "globalThis", "arguments", "crypto", "URL", "fetch", "structuredClone",
]);

/** JS keywords that must never be treated as member references. */
// Note: "type" is deliberately NOT in this list. It is only a contextual
// keyword (type aliases) and can never appear as a keyword inside a markup
// expression — but it is an extremely common property name, and skipping it
// broke `@type` (rendered bare `type` instead of `this.type` at runtime).
const JS_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break", "continue",
  "return", "throw", "try", "catch", "finally", "new", "delete", "typeof", "void",
  "instanceof", "in", "of", "await", "async", "yield", "const", "let", "var", "function",
  "class", "extends", "implements", "interface", "enum", "import", "export",
  "from", "as", "get", "set", "null", "true", "false", "constructor",
]);

export function generateCode(document: DocumentNode, options: CodegenOptions, diagnostics: DiagnosticBag): CodegenResult {
  return new Codegen(options, diagnostics).run(document);
}

class Codegen {
  private readonly lines: string[] = [];
  private maps: MapEntry[] = [];
  /** Precise (outOffset, srcOffset)-pairs for the expression currently being
   *  emitted, registered by bakeMemberRefs and flushed by the next stmt(). They
   *  give position-aware tooling (LSP) token-granularity mappings inside
   *  expressions instead of the statement-start approximation. */
  private pendingExprEntries: Array<{ outOffset: number; srcOffset: number }> = [];
  private readonly runtimeImports = new Set<string>();
  private readonly componentImports = new Map<string, string>(); // tagName → local name
  private readonly componentLocalNames = new Map<string, string>(); // tagName → local
  private readonly typeImports = new Map<string, string>(); // typeName → local
  private readonly plainImports: string[] = [];
  private readonly seqStack: SeqScope[] = [{ next: 0 }];
  /** Locals declared by loops / inline code — emitted without a `this.` prefix. */
  private readonly locals = new Set<string>();
  private readonly metadata: CodegenResult["metadata"] = { usings: [], injects: [], typeParams: [] };
  private inheritsBase = "ComponentBase";

  constructor(
    private readonly options: CodegenOptions,
    private readonly diagnostics: DiagnosticBag,
  ) {}

  run(document: DocumentNode): CodegenResult {
    if (this.options.scopeHash) this.metadata.scopeHash = this.options.scopeHash;
    const directives = document.directives;
    for (const d of directives) {
      switch (d.name) {
        case "page":
          this.metadata.routeTemplate = unquote(d.value);
          break;
        case "layout":
          this.metadata.layout = d.value.trim();
          break;
        case "authorize":
          this.metadata.authorize = true;
          break;
        case "using":
          this.metadata.usings.push(d.value.trim());
          break;
        case "inject": {
          const parts = d.value.trim().split(/\s+/);
          if (parts.length < 2) {
            this.diagnostics.error("TZR001", d.pos, "Usage: @inject <Type> <Name>.");
            break;
          }
          const name = parts[parts.length - 1]!;
          const type = parts.slice(0, -1).join(" ");
          this.metadata.injects.push({ type, name });
          this.resolveType(type);
          break;
        }
        case "inherits":
          this.metadata.inherits = d.value.trim();
          break;
        case "typeparam":
          this.metadata.typeParams.push(d.value.trim());
          break;
        default:
          this.diagnostics.error("TZR001", d.pos, `Unknown directive '@${d.name}'.`);
      }
    }

    if (this.metadata.inherits) {
      const base = this.metadata.inherits;
      this.inheritsBase = this.resolveType(base);
    }
    if (this.options.codeBehindClass) {
      if (this.metadata.inherits) {
        this.diagnostics.warning(
          "TZR011",
          document.directives.find((d) => d.name === "inherits")!.pos,
          "… the code-behind file's own base class (X.tazor.ts) wins — remove the '@inherits' directive.",
        );
      }
      this.metadata.codeBehindClass = this.options.codeBehindClass;
      this.inheritsBase = this.options.codeBehindClass;
    }

    // Collect member code blocks and scan for runtime API usage.
    const memberCode = document.body.filter((n): n is Extract<MarkupNode, { kind: "codeBlock" }> => n.kind === "codeBlock" && n.member === true);
    const renderBody = document.body.filter((n) => !(n.kind === "codeBlock" && n.member === true));

    const memberSource = memberCode.map((n) => n.code).join("\n");
    if (/@Parameter\s*\(/.test(memberSource)) this.runtimeImports.add("Parameter");
    if (/@CascadingParameter\s*\(/.test(memberSource)) this.runtimeImports.add("CascadingParameter");
    if (this.metadata.injects.length > 0 || /\binject\s*\(/.test(memberSource)) this.runtimeImports.add("inject");

    // Pre-resolve component tags so imports come out once, before the class.
    this.preResolve(document.body, this.metadata.usings);

    // --- Emit the module -------------------------------------------------
    this.runtimeImports.add("ComponentBase");
    this.runtimeImports.add("RenderTreeBuilder");
    this.line(`/* Generated by @tasor/compiler from ${this.options.fileName ?? "component"} — do not edit. */`);
    this.line("");
    // The runtime import depends on APIs discovered during body emission
    // (e.g. EventCallback from event handlers), so its line is spliced in
    // after the body has been generated.
    const runtimeImportLine = this.lines.length;

    for (const [tagName, local] of this.componentImports) {
      const resolved = this.options.resolveComponent?.(tagName, this.metadata.usings) ?? null;
      const spec = resolved?.specifier ?? tagName;
      if (resolved?.exportName) {
        this.line(`import { ${resolved.exportName} as ${local} } from "${spec}";`);
      } else {
        this.line(`import ${local} from "${spec}";`);
      }
    }
    if (this.componentImports.size > 0) this.line("");

    for (const [typeName, local] of this.typeImports) {
      const resolved = this.options.resolveType?.(typeName, this.metadata.usings) ?? null;
      const spec = resolved?.specifier ?? typeName;
      if (resolved?.exportName) this.line(`import { ${resolved.exportName} as ${typeName} } from "${spec}";`);
      else this.line(`import ${typeName} from "${spec}";`);
    }
    if (this.typeImports.size > 0) this.line("");

    for (const imp of this.options.imports ?? []) this.line(imp);
    if ((this.options.imports ?? []).length > 0) this.line("");

    for (const [ns, spec] of Object.entries(this.options.usingSpecifiers ?? {})) {
      this.line(`import { ${ns} } from "${spec}";`);
    }

    if (this.metadata.routeTemplate) {
      this.line(`export const routeTemplate = ${JSON.stringify(this.metadata.routeTemplate)};`);
      if (this.metadata.authorize) this.line(`export const routeAuthorize = true;`);
      this.line("");
    }

    const typeParams = this.metadata.typeParams;
    const typeDecl = typeParams.length > 0 ? `<${typeParams.join(", ")}>` : "";
    for (const attr of directives.filter((d) => d.name === "attribute")) {
      this.line(attr.value.trim());
    }
    this.line(`export default class ${this.options.className}${typeDecl} extends ${this.inheritsBase} {`);
    if (this.metadata.routeTemplate) {
      this.line("  static routeTemplate = routeTemplate;");
      if (this.metadata.authorize) this.line("  static routeAuthorize = routeAuthorize;");
      this.line("");
    }
    for (const inject of this.metadata.injects) {
      this.line(`  private readonly ${inject.name} = inject(${inject.type});`);
    }
    if (this.metadata.injects.length > 0) this.line("");

    // @code blocks verbatim, re-indented into the class.
    for (const block of memberCode) {
      this.commentLine(`/* @code (${this.options.fileName ?? ""}:${block.pos.line}) */`);
      this.emitCodeVerbatim(block.code, block.pos.line, 2);
      this.line("");
    }

    this.line("  protected override buildRenderTree(b: RenderTreeBuilder): void {");
    this.emitNodes(renderBody, { line: 0, column: 0 });
    this.line("  }");
    this.line("}");
    this.line("");

    // Splice the runtime import in at its header position, now that body
    // emission has revealed every runtime API the module uses. Mappings
    // recorded so far are 1-based line indices, so they shift with the insert.
    this.maps = this.maps.map((m) => ({ ...m, genLine: m.genLine + 2 }));
    this.lines.splice(
      runtimeImportLine,
      0,
      `import { ${[...this.runtimeImports].sort().join(", ")} } from "@tasor/runtime";`,
      "",
    );

    const code = this.lines.join("\n") + "\n";
    return { code, mappings: this.takeMappings(), metadata: this.metadata };
  }

  /** Produces the mapping entries for the sourcemap stage. */
  takeMappings(): MapEntry[] {
    return this.maps;
  }

  /* ------------------------------------------------------------------ */

  private preResolve(nodes: MarkupNode[], usings: string[]): void {
    for (const node of nodes) {
      if (node.kind === "element" && node.isComponent) {
        this.localForComponent(node.tagName, usings, node.pos);
      }
      const nested =
        node.kind === "element" ? node.children
        : node.kind === "textTag" ? node.children
        : node.kind === "if" ? node.branches.flatMap((br) => br.children)
        : node.kind === "for" ? node.children
        : node.kind === "switch" ? node.cases.flatMap((c) => c.children)
        : [];
      if (nested.length > 0) this.preResolve(nested, usings);
    }
  }

  private localForComponent(tagName: string, usings: string[], pos: SourcePos): string | null {
    const existing = this.componentLocalNames.get(tagName);
    if (existing !== undefined) return existing;
    const resolved = this.options.resolveComponent?.(tagName, usings) ?? null;
    if (!resolved) {
      this.diagnostics.warning("TZR005", pos, `Component '<${tagName}>' could not be resolved; it will be emitted as an element.`);
      this.componentLocalNames.set(tagName, "__tasor_unresolved");
      return null;
    }
    const local = `__tasor_comp_${tagName.replace(/[^A-Za-z0-9_]/g, "_")}`;
    this.componentLocalNames.set(tagName, local);
    this.componentImports.set(tagName, local);
    return local;
  }

  private resolveType(name: string): string {
    if (this.typeImports.has(name)) return name;
    const resolved = this.options.resolveType?.(name, this.metadata.usings) ?? null;
    if (resolved) this.typeImports.set(name, name);
    return name;
  }

  private seq(): number {
    return this.seqStack[this.seqStack.length - 1]!.next++;
  }

  private enterScope(): void {
    this.seqStack.push({ next: 0 });
  }

  private leaveScope(): void {
    this.seqStack.pop();
  }

  /**
   * Rewrites an expression's bare member references to `this.X` (C# allows
   * bare member references; TS does not). Locals (loop variables, arrow
   * parameters), TS globals and keywords pass through untouched; identifiers
   * after a `.` are property accesses and stay bare.
   */
  private expr(code: string, srcBase?: number): string {
    const trimmed = code.trim();
    if (trimmed.length === 0) return code;
    // srcBase = column delta between the node position (the leading '@') and
    // index 0 of the expression code (1 for `@expr`, 2 for `@(expr)`). Unset
    // (attribute values, control headers) → no token-precise mapping.
    return this.bakeMemberRefs(
      trimmed,
      srcBase === undefined ? undefined : srcBase + (code.length - code.trimStart().length),
    );
  }

  /**
   * Rewrites every bare identifier to `this.name` across the whole expression
   * (not just the leading one — `@for (const x of items)` and conditions like
   * `a && b` need this too). Skips strings, comments, property accesses after
   * `.`, keywords, TS globals, enclosing locals, locals declared in the span
   * itself and arrow parameters.
   */
  private bakeMemberRefs(code: string, preciseSrcBase?: number): string {
    if (!/[A-Za-z_$]/.test(code)) return code;

    // Token-precise source offsets (LSP): only while the token is still on the
    // expression's first source line (later lines have no single srcCol base).
    const precise = preciseSrcBase !== undefined;
    if (precise) this.pendingExprEntries = [];
    const precisePush = (outOffset: number, srcIndex: number): void => {
      if (!precise || code.slice(0, srcIndex).includes("\n")) return;
      this.pendingExprEntries.push({ outOffset, srcOffset: preciseSrcBase! + srcIndex });
    };

    const spanLocals = new Set<string>(this.locals);
    for (const m of code.matchAll(/(?:^|[\s(,;])(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
      spanLocals.add(m[1]!);
    }
    // Arrow parameters: `(a, b) =>` or `x =>` — their names are locals too.
    for (const m of code.matchAll(/=>/g)) {
      const arrowAt = m.index ?? 0;
      let j = arrowAt - 1;
      while (j >= 0 && /\s/.test(code[j]!)) j--;
      if (j >= 0 && code[j] === ")") {
        let depth = 0;
        let k = j;
        while (k >= 0) {
          const c = code[k];
          if (c === ")") depth++;
          else if (c === "(") {
            depth--;
            if (depth === 0) break;
          }
          k--;
        }
        if (k >= 0) {
          for (const part of code.slice(k + 1, j).split(",")) {
            for (const idm of part.matchAll(/[A-Za-z_$][\w$]*/g)) spanLocals.add(idm[0]);
          }
        }
      } else if (j >= 0) {
        let k = j;
        while (k >= 0 && /[\w$]/.test(code[k]!)) k--;
        const name = code.slice(k + 1, j + 1);
        if (/^[A-Za-z_$]/.test(name)) spanLocals.add(name);
      }
    }

    const scanner = new TSScanner(code, () => ({ line: 0, column: 0 }));
    let out = "";
    let i = 0;
    while (i < code.length) {
      const ch = code[i]!;
      if (ch === '"' || ch === "'" || ch === "`") {
        const end = scanner.skipStringFor(i, ch);
        const stop = end > i ? end : i + 1;
        out += code.slice(i, stop);
        i = stop;
        continue;
      }
      if (ch === "/" && code[i + 1] === "/") {
        const end = code.indexOf("\n", i);
        const stop = end < 0 ? code.length : end;
        out += code.slice(i, stop);
        i = stop;
        continue;
      }
      if (ch === "/" && code[i + 1] === "*") {
        const end = code.indexOf("*/", i + 2);
        const stop = end < 0 ? code.length : end + 2;
        out += code.slice(i, stop);
        i = stop;
        continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let e = i;
        while (e < code.length && /[\w$]/.test(code[e]!)) e++;
        const name = code.slice(i, e);
        const afterDot = i > 0 && code[i - 1] === ".";
        const skipBake =
          afterDot || spanLocals.has(name) || KNOWN_GLOBALS.has(name) || this.options.knownGlobals?.has(name) || JS_KEYWORDS.has(name);
        // Token-precise mapping anchors the identifier's own generated token
        // (after a baked `this.` prefix — the prefix itself is synthetic and
        // carries no source position).
        precisePush(skipBake ? out.length : out.length + "this.".length, i);
        out += skipBake ? name : `this.${name}`;
        i = e;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }

  private line(text: string): void {
    this.lines.push(text);
  }

  private commentLine(text: string): void {
    this.line(text);
  }

  private stmt(text: string, pos: SourcePos, expressionStart?: number): void {
    this.line("    " + text);
    this.maps.push({ genLine: this.lines.length, genCol: 4, srcLine: pos.line - 1, srcCol: pos.column });
    // Token-precise entries: outOffsets are relative to the expression inside
    // the statement text, so the baked expression's own start offset applies.
    const exprBase = expressionStart ?? 0;
    for (const p of this.pendingExprEntries) {
      this.maps.push({
        genLine: this.lines.length,
        genCol: 4 + exprBase + p.outOffset,
        srcLine: pos.line - 1,
        srcCol: pos.column + p.srcOffset,
      });
    }
    this.pendingExprEntries = [];
  }

  private emitCodeVerbatim(code: string, srcLine: number, indent: number): void {
    for (const rawLine of code.split("\n")) {
      const line = rawLine.replace(/\t/g, "  ");
      this.line(line.length > 0 ? " ".repeat(indent) + line : "");
      if (line.trim().length > 0) {
        const firstContent = line.length - line.trimStart().length;
        this.maps.push({
          genLine: this.lines.length,
          genCol: indent + firstContent,
          srcLine: srcLine - 1,
          srcCol: firstContent,
        });
      }
      srcLine++;
    }
  }

  private emitNodes(nodes: MarkupNode[], pos: SourcePos): void {
    for (const node of nodes) this.emitNode(node, pos);
  }

  private emitNode(node: MarkupNode, _pos: SourcePos): void {
    switch (node.kind) {
      case "text": {
        if (node.content.length === 0) return;
        // Whitespace-only text that spans lines separates block-level nodes —
        // Razor treats it as insignificant and so do we.
        if (/^\s+$/.test(node.content) && node.content.includes("\n")) return;
        this.stmt(`b.addContent(${this.seq()}, ${JSON.stringify(decodeHtmlEntities(node.content))});`, node.pos);
        break;
      }
      case "directive":
        break; // handled at document level
      case "expression": {
        // Implicit `@expr` code starts at column(pos)+1; `@(expr)` at +2
        // (leading inner whitespace in the source gives it away).
        const srcBase = node.code !== node.code.trimStart() ? 2 : 1;
        const baked = this.expr(node.code, srcBase);
        const text = `b.addContent(${this.seq()}, ${baked});`;
        this.stmt(text, node.pos, text.indexOf(baked));
        break;
      }
      case "codeBlock": {
        this.stmt(`{`, node.pos);
        this.emitCodeVerbatim(this.bakeMemberRefs(node.code), node.pos.line, 4);
        this.stmt(`}`, node.pos);
        break;
      }
      case "textTag":
        this.emitNodes(node.children, node.pos);
        break;
      case "element":
        if (node.isComponent) {
          if (this.componentLocalNames.get(node.tagName) === "__tasor_unresolved") {
            this.emitElement(node);
          } else {
            this.emitComponent(node);
          }
        } else {
          this.emitElement(node);
        }
        break;
      case "if":
        this.emitIf(node);
        break;
      case "for": {
        if (node.isForEach) {
          // C#-style @foreach (var item in items) → for (const item of this.items).
          const match = /^\s*(?:var|let|const)?\s*([A-Za-z_$][A-Za-z0-9_$]*)\s+in\s+([\s\S]+)$/.exec(node.code);
          if (match) {
            const [, name, iterable] = match;
            this.stmt(`for (const ${name} of ${this.expr(iterable!)}) {`, node.pos);
            this.locals.add(name!);
            for (const child of node.children) this.emitNode(child, node.pos);
            this.locals.delete(name!);
            this.stmt(`}`, node.pos);
            break;
          }
          this.diagnostics.warning("TZR001", node.pos, "@foreach expects '(variable in iterable)'; falling back to verbatim for-header.");
        }
        // Plain @for: register declared loop variables so their bodies resolve.
        const init = node.code.split(";")[0] ?? "";
        const declared = [...init.matchAll(/(?:^|[\s(,])(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((m) => m[1]!);
        for (const name of declared) this.locals.add(name);
        this.stmt(`for (${this.bakeMemberRefs(node.code)}) {`, node.pos);
        for (const child of node.children) this.emitNode(child, node.pos);
        for (const name of declared) this.locals.delete(name);
        this.stmt(`}`, node.pos);
        break;
      }
      case "switch":
        this.emitSwitch(node);
        break;
    }
  }

  private emitElement(node: ElementNode): void {
    const name = node.tagName;
    const key = node.attributes.find((a) => a.kind === "key");
    const refs = node.attributes.filter((a) => a.kind === "ref");
    const regular = node.attributes.filter((a) => a.kind !== "key" && a.kind !== "ref");

    const seq = this.seq();
    const raw = JSON.stringify(name);
    const open = `b.openElement(${seq}, ${raw});`;
    // Tag token: hovering `<div` maps to the generated tag literal instead of
    // plumbing on a shared anchor (see plumbingStmt); +1 puts the offset inside
    // the string literal.
    this.pendingExprEntries.push({
      outOffset: "b.openElement(".length + String(seq).length + 2 + 1,
      srcOffset: 1,
    });
    this.stmt(open, node.pos);
    if (this.options.scopeHash) {
      this.stmt(`b.addAttribute(${this.seq()}, ${JSON.stringify(this.options.scopeHash)}, "");`, node.pos);
    }
    if (key && key.kind === "key") this.emitKeyStmt(key, node.pos);
    for (const attr of regular) this.emitAttribute(attr, { tag: name, attributes: regular });
    for (const ref of refs) {
      if (ref.kind !== "ref") continue;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ref.code)) {
        this.diagnostics.error("TZR008", node.pos, "@ref requires a bare property name.");
        continue;
      }
      this.emitRefStmt(ref, node.pos);
    }
    this.emitNodes(node.children, node.pos);
    this.plumbingStmt(`b.closeElement();`);
  }

  /** `@ref="name"` → synthetic `this.name` member capture, token-anchored so
   *  hover/go-to-def on the ref name resolves the captured property. */
  private emitRefStmt(ref: Extract<AttributeNode, { kind: "ref" }>, pos: SourcePos): void {
    const seq = this.seq();
    const text = `b.addElementReferenceCapture(${seq}, (el) => { this.${ref.code} = el; });`;
    if (ref.codeStart !== undefined) {
      this.pendingExprEntries.push({
        outOffset: text.indexOf(`this.${ref.code}`) + "this.".length,
        srcOffset: ref.codeStart.column - pos.column,
      });
    }
    this.stmt(text, pos);
  }

  /** `@key="expr"` → `b.setKey(...)`, token-precise like attribute values. */
  private emitKeyStmt(key: Extract<AttributeNode, { kind: "key" }>, pos: SourcePos): void {
    const baked = this.expr(key.code, key.codeStart === undefined ? undefined : key.codeStart.column - pos.column);
    const text = `b.setKey(${baked});`;
    this.stmt(text, pos, text.indexOf(baked));
  }

  private emitComponent(node: ElementNode): void {
    const local = this.localForComponent(node.tagName, this.metadata.usings, node.pos)!;
    const key = node.attributes.find((a) => a.kind === "key");
    const refs = node.attributes.filter((a) => a.kind === "ref");
    const regular = node.attributes.filter((a) => a.kind !== "key" && a.kind !== "ref");
    const hasChildren = node.children.length > 0;

    const seq = this.seq();
    const open = `b.openComponent(${seq}, ${local});`;
    // Tag token: hovering `<AddressEditor` maps to the component local (quick
    // info / go-to-def on the component) instead of plumbing on a shared anchor.
    this.pendingExprEntries.push({ outOffset: "b.openComponent(".length + String(seq).length + 2, srcOffset: 1 });
    this.stmt(open, node.pos);
    if (key && key.kind === "key") this.emitKeyStmt(key, node.pos);
    for (const attr of regular) this.emitAttribute(attr, { tag: node.tagName, attributes: regular, isComponent: true });
    for (const ref of refs) {
      if (ref.kind !== "ref") continue;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ref.code)) {
        this.diagnostics.error("TZR008", node.pos, "@ref on components requires a bare property name.");
        continue;
      }
      this.emitRefStmt(ref, node.pos);
    }
    if (hasChildren) {
      this.stmt(`b.addContent(${this.seq()}, (b) => {`, node.pos);
      this.enterScope();
      for (const child of node.children) this.emitNode(child, node.pos);
      this.leaveScope();
      this.stmt(`});`, node.pos);
    }
    this.plumbingStmt(`b.closeComponent();`);
  }

  /** Emits a statement whose generated text has NO source mapping: plumbing
   *  lines (closeElement/closeComponent) stay anchor-free so position lookups
   *  from the source (hover, go-to-def) can never land on them — an equal
   *  srcCol anchor of open + close used to let the close entry win every
   *  lookup on the tag line (TazorGenMap.findSrc takes the last entry
   *  at-or-left). These lines fall back to null → v1 heuristics. */
  private plumbingStmt(text: string): void {
    this.line("    " + text);
  }

  private emitAttribute(attr: AttributeNode, ctx?: { tag: string; attributes: AttributeNode[]; isComponent?: boolean }): void {
    const pos = attr.pos;
    // Token-precise source base for the attribute's value expression: offset
    // between the statement anchor (the attribute name) and the code text.
    const srcBase = (): number | undefined => {
      const cs = "codeStart" in attr ? attr.codeStart : undefined;
      return cs === undefined ? undefined : cs.column - pos.column;
    };
    switch (attr.kind) {
      case "static":
        this.stmt(`b.addAttribute(${this.seq()}, ${JSON.stringify(attr.name)}, ${JSON.stringify(decodeHtmlEntities(attr.value))});`, pos);
        break;
      case "expression": {
        const baked = this.expr(attr.code, srcBase());
        // Razor's method-group / lambda conversion: on a component tag, an
        // on*-named attribute value is an event callback. Razor binds method
        // groups AND lambdas to the component instance via the
        // EventCallbackFactory; in TS a bare `this.handler` loses `this`, and
        // an arrow passed as a plain function is bound by the renderer to the
        // nearest component (wrong receiver inside child-content fragments —
        // the owning page would never re-render). So the compiler binds every
        // on*-named component attribute value to `this` up front: the handler
        // runs on the authoring component and its StateHasChanged fires.
        let value = baked;
        if (ctx?.isComponent && EVENT_ATTR_PATTERN.test(attr.name)) {
          value = `EventCallback.bind(this, ${baked})`;
          this.runtimeImports.add("EventCallback");
        }
        const text = `b.addAttribute(${this.seq()}, ${JSON.stringify(attr.name)}, ${value});`;
        this.stmt(text, pos, text.indexOf(value));
        break;
      }
      case "mixedValue": {
        // Per-part precise entries: bakeMemberRefs only fills pendingExprEntries
        // for the part currently being baked, so capture and re-offset per part.
        // Offsets are left in stmt-text coordinates — no expressionStart pass.
        const precise: Array<{ outOffset: number; srcOffset: number }> = [];
        let template = "";
        for (const part of attr.parts) {
          if (part.code !== undefined) {
            this.pendingExprEntries = [];
            const baked = this.expr(part.code, part.codeStart === undefined ? undefined : part.codeStart.column - pos.column);
            for (const entry of this.pendingExprEntries) {
              precise.push({ outOffset: template.length + 2 + entry.outOffset, srcOffset: entry.srcOffset });
            }
            template += `\${${baked}}`;
          } else {
            template += escapeTemplate(decodeHtmlEntities(part.text ?? ""));
          }
        }
        this.pendingExprEntries = precise;
        const text = `b.addAttribute(${this.seq()}, ${JSON.stringify(attr.name)}, \`${template}\`);`;
        this.stmt(text, pos);
        break;
      }
      case "eventHandler": {
        const bare = bareIdentifier(attr.code);
        const callback = bare ? `this.${attr.code}` : this.expr(attr.code, srcBase());
        const flags = attr.flags === 0 ? "" : `, ${attr.flags}`;
        const text = `b.addEventHandler(${this.seq()}, ${JSON.stringify(attr.name)}, EventCallback.bind(this, ${callback})${flags});`;
        if (bare && srcBase() !== undefined) {
          // Synthetic `this.` prefix — anchor the handler name token manually.
          this.pendingExprEntries.push({ outOffset: text.indexOf(callback) + "this.".length, srcOffset: srcBase()! });
        }
        this.stmt(text, pos, bare ? undefined : text.indexOf(callback));
        this.runtimeImports.add("EventCallback");
        break;
      }
      case "attributes": {
        const baked = this.expr(attr.code, srcBase());
        const text = `b.addMultipleAttributes(${this.seq()}, ${baked});`;
        this.stmt(text, pos, text.indexOf(baked));
        break;
      }
      case "bind":
        this.emitBind(attr, ctx ?? { tag: "", attributes: [attr] });
        break;
      case "key":
      case "ref":
        break; // handled by emitElement/emitComponent
    }
  }

  /** Emits Blazor's @bind family: value + change handler, get/set/after, or
   *  Value + ValueChanged for component parameter targets. */
  private emitBind(attr: Extract<AttributeNode, { kind: "bind" }>, ctx: { tag: string; attributes: AttributeNode[]; isComponent?: boolean }): void {
    const pos = attr.pos;

    if (attr.format !== undefined) {
      // v1: native input display formatting applies; a custom format string is
      // accepted but only affects parsing of number/date inputs.
      this.diagnostics.warning("TZR008", pos, "'@bind:format' has limited v1 support: number and date inputs use native parsing.");
    }

    // Component parameter binding: @bind-Target or @bind on a component tag
    // → Target + TargetChanged / Value + ValueChanged parameter pair.
    if (attr.bindTarget !== undefined || ctx.isComponent === true) {
      const target = attr.bindTarget ?? "Value";
      this.emitComponentBind(attr, target, pos);
      return;
    }

    // Element binding: @bind / @bind:get / @bind:set / @bind:after / @bind:event.
    const tag = ctx.tag.toLowerCase();
    const inputType = staticAttributeValue(ctx.attributes, "type")?.toLowerCase();
    const isCheckbox = tag === "input" && inputType === "checkbox";
    const isNumber = tag === "input" && inputType === "number";
    const isDate = tag === "input" && inputType === "date";
    const valueAttribute = isCheckbox ? "checked" : "value";
    const event = attr.event ?? "onchange";

    // Value side: @bind:get overrides @bind's expression.
    const display = attr.get !== undefined ? this.expr(attr.get) : this.expr(attr.expression ?? "");
    if (display.length === 0) {
      this.diagnostics.error("TZR009", pos, "'@bind' requires an expression.");
      return;
    }

    // Extraction of the DOM value inside the change handler.
    let extract = "(e.target as HTMLInputElement).value";
    if (isCheckbox) extract = "(e.target as HTMLInputElement).checked";
    else if (isNumber) extract = "Number((e.target as HTMLInputElement).value)";
    else if (isDate) extract = "new Date((e.target as HTMLInputElement).value)";

    const handlerBody = () => {
      const parts: string[] = [];
      if (attr.set !== undefined) {
        parts.push(`(${this.expr(attr.set)})(${extract})`);
      } else {
        const assignmentTarget = this.expr(attr.expression ?? "");
        if (!isAssignableTarget(assignmentTarget)) {
          this.diagnostics.error("TZR008", pos, `@bind requires a settable member expression (got '${assignmentTarget}').`);
        } else if (isCheckbox) {
          parts.push(`${assignmentTarget} = ${extract}`);
        } else if (isNumber) {
          parts.push(`${assignmentTarget} = Number.isNaN(Number((e.target as HTMLInputElement).value)) ? ${assignmentTarget} : ${extract}`);
        } else if (isDate) {
          parts.push(`${assignmentTarget} = ${extract}`);
        } else {
          parts.push(`${assignmentTarget} = ${extract}`);
        }
      }
      if (attr.after !== undefined) {
        const after = bareIdentifier(attr.after) ? `this.${attr.after}()` : `(${this.expr(attr.after)})()`;
        parts.push(after);
      }
      return parts.join("; ");
    };

    this.stmt(`b.addAttribute(${this.seq()}, ${JSON.stringify(valueAttribute)}, ${display});`, pos);
    this.stmt(
      `b.addEventHandler(${this.seq()}, ${JSON.stringify(event)}, EventCallback.bind(this, (e) => { ${handlerBody()}; }));`,
      pos,
    );
    this.runtimeImports.add("EventCallback");
  }

  /**
   * Emits a component parameter bind: `<Target>` from the bound expression
   * plus `<Target>Changed` as an EventCallback that writes back. Supports
   * the @bind:get/:set/:after modifiers (Blazor's .NET-7 semantics).
   */
  private emitComponentBind(attr: Extract<AttributeNode, { kind: "bind" }>, target: string, pos: SourcePos): void {
    const label = attr.bindTarget !== undefined ? `@bind-${target}` : `@bind (component)`;

    const display = attr.get !== undefined ? this.expr(attr.get) : this.expr(attr.expression ?? "");
    if (display.length === 0) {
      this.diagnostics.error("TZR009", pos, `${label} requires an expression.`);
      return;
    }

    let setter: string;
    if (attr.set !== undefined) {
      setter = `(${this.expr(attr.set)})(v)`;
    } else {
      const assignmentTarget = this.expr(attr.expression ?? "");
      if (!isAssignableTarget(assignmentTarget)) {
        this.diagnostics.error("TZR008", pos, `${label} requires a settable member expression.`);
        return;
      }
      setter = `${assignmentTarget} = v`;
    }
    const after = attr.after !== undefined
      ? (bareIdentifier(attr.after) ? `; this.${attr.after}()` : `; (${this.expr(attr.after)})()`)
      : "";

    this.stmt(`b.addAttribute(${this.seq()}, ${JSON.stringify(target)}, ${display});`, pos);
    this.stmt(
      `b.addAttribute(${this.seq()}, ${JSON.stringify(`${target}Changed`)}, EventCallback.bind(this, (v) => { ${setter}${after}; }));`,
      pos,
    );
    this.runtimeImports.add("EventCallback");
  }

  private emitIf(node: Extract<MarkupNode, { kind: "if" }>): void {
    node.branches.forEach((branch, index) => {
      const prefix = index === 0 ? "if" : branch.condition !== null ? "else if" : "else";
      if (prefix === "else") {
        this.stmt(`else {`, branch.span?.pos ?? node.pos);
      } else {
        this.stmt(`${prefix} (${this.expr(branch.condition!)}) {`, branch.span?.pos ?? node.pos);
      }
      for (const child of branch.children) this.emitNode(child, node.pos);
      this.stmt(`}`, node.pos);
    });
  }

  private emitSwitch(node: Extract<MarkupNode, { kind: "switch" }>): void {
    this.stmt(`switch (${this.expr(node.code)}) {`, node.pos);
    for (const c of node.cases) {
      if (c.code === null) {
        this.stmt(`default: {`, c.span?.pos ?? node.pos);
      } else {
        this.stmt(`case ${this.bakeMemberRefs(c.code)}: {`, c.span?.pos ?? node.pos);
      }
      for (const child of c.children) this.emitNode(child, node.pos);
      this.stmt(`break;`, c.span?.pos ?? node.pos);
      this.stmt(`}`, c.span?.pos ?? node.pos);
    }
    this.stmt(`}`, node.pos);
  }
}

/** Attribute frames come first: emit them before children. */
function unquote(value: string): string {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  return v;
}

function bareIdentifier(code: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(code);
}

/** Whether an emitted left-hand side can be assigned to (this.x, item.Name). */
function isAssignableTarget(target: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(target);
}

/** Static string value of an attribute (only literal values are resolvable). */
function staticAttributeValue(attributes: AttributeNode[], name: string): string | undefined {
  for (const attr of attributes) {
    if (attr.kind === "static" && attr.name.toLowerCase() === name.toLowerCase()) {
      return attr.value;
    }
  }
  return undefined;
}

function escapeTemplate(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

export type { MapEntry };