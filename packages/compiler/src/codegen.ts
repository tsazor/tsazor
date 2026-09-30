import type {
  AttributeNode,
  CodeBlockNode,
  DirectiveNode,
  DocumentNode,
  ElementNode,
  MarkupNode,
  StatementNode,
} from "./ast.js";
import { childNodes } from "./ast.js";
import { DiagnosticBag, type SourcePos } from "./diagnostics.js";
import { decodeHtmlEntities } from "./entities.js";
import { LIB_GLOBALS } from "./globals.generated.js";
import { importStatements, parseImportDirective, type ImportInfo } from "./imports.js";
import {
  collectBodyMembers,
  collectDefaultClassMembers,
  emptyMembers,
  rewriteSnippet,
  type NameResolver,
  type RewriteResult,
  type SnippetKind,
} from "./rewrite.js";
import { advancePos, CodeWriter, type WriterAnchor } from "./writer.js";

export interface ResolvedComponent {
  specifier: string;
  /** Exported name; undefined = default export. */
  exportName?: string;
  /** Every source the tag resolves in, when more than one (⇒ TZS017). */
  ambiguous?: string[];
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
  /** Extra import lines (code-behind, scoped-CSS sidecar). */
  imports?: string[];
  /**
   * `@import` directives inherited from the _Imports.tsazor chain, nearest
   * first, relative specifiers already rebased to this file. A binding the
   * file itself (or a nearer layer) already declares is dropped.
   */
  inheritedImports?: readonly ImportInfo[];
  /** Checks one of the file's `@using` values; a returned message becomes a TZS018 warning. */
  resolveUsing?: (value: string) => string | null;
  /** Map of usings to emit as plain module imports (namespace → specifier). */
  usingSpecifiers?: Record<string, string>;
  /** Source file name used in the sourcemap. */
  fileName?: string;
  /**
   * Full scope attribute name (e.g. "b-1a2b3c4d") for scoped CSS. When set,
   * every emitted plain DOM element gets this attribute first; components are
   * left alone (Blazor behavior). Unset → byte-identical emission as before.
   */
  scopeHash?: string;
  /**
   * Class name of the default export of the sibling `X.tsazor.ts` (code-behind).
   * When set, the generated class extends it — the code-behind class itself
   * declares its own base (usually ComponentBase). Takes precedence over
   * @inherits; a conflicting @inherits emits a TZS011 warning. Unset →
   * byte-identical emission as before.
   */
  codeBehindClass?: string;
  /**
   * Source of the code-behind `X.tsazor.ts`: the members of its default
   * class are component members for the expression rewriter (`this.X`) even
   * where an `@import` or a global has the same name.
   */
  codeBehindSource?: string;
}

export interface CodegenResult {
  code: string;
  mappings: Array<{ genLine: number; genCol: number; srcLine: number; srcCol: number }>;
  metadata: {
    /** First @page template (compatibility; see routeTemplates). */
    routeTemplate?: string;
    /** Every @page template in source order — Blazor registers each as a route. */
    routeTemplates: string[];
    layout?: string;
    /** Bare @authorize directive on a @page → authentication-required route. */
    authorize?: boolean;
    usings: string[];
    /** The file's own `@import` directives, parsed (invalid ones are dropped). */
    imports: ImportInfo[];
    injects: Array<{ type: string; name: string }>;
    typeParams: string[];
    inherits?: string;
    /** Echo of options.scopeHash (scoped-CSS attribute name), when set. */
    scopeHash?: string;
    /** Echo of options.codeBehindClass (sibling X.tsazor.ts base class), when set. */
    codeBehindClass?: string;
  };
}

interface MapEntry {
  genLine: number;
  genCol: number;
  srcLine: number;
  srcCol: number;
}

/** A token-precise entry before it is placed: `outOffset` is relative to the
 *  baked expression (or statement text, see stmt()). */
interface PendingEntry {
  outOffset: number;
  srcLine: number;
  srcCol: number;
}

/** Component attributes whose name marks them as event callbacks (On*, on*). */
const EVENT_ATTR_PATTERN = /^on/i;

/** Emission context: tracks sequence numbers per fragment scope. */
interface SeqScope {
  next: number;
}

/**
 * Hygienic names of the generated code (Razor: `__builder`): the builder
 * parameter, the generated handler parameters, the runtime APIs only the
 * generated code uses and the captured component — none can collide with a
 * user local, member or `@import` of the same plain name.
 */
const BUILDER = "__builder";
const THIS_ALIAS = "__tsazor_this";
const BIND_METHOD = "__tsazor_bindMethod";
const alias = (name: string): string => `__tsazor_${name}`;

export function generateCode(document: DocumentNode, options: CodegenOptions, diagnostics: DiagnosticBag): CodegenResult {
  return new Codegen(options, diagnostics).run(document);
}

class Codegen {
  private readonly writer = new CodeWriter();
  /** Precise (outOffset → absolute source position) entries for the expression
   *  currently being emitted, registered by rewrite() and flushed by the
   *  next stmt(). They give token-granularity mappings inside expressions
   *  (also on their continuation lines) instead of the statement-start
   *  approximation. `srcLine` is 0-based, like SourceMapEntry. */
  private pendingExprEntries: PendingEntry[] = [];
  /** Runtime APIs user code may reference by their plain name (imported unless an `@import` binds them). */
  private readonly runtimeImports = new Set<string>();
  /** Runtime APIs of the generated code, imported under hygienic aliases. */
  private readonly runtimeAliases = new Set<string>();
  /** Component members, syntactically: `@code`, code-behind, `@inject` fields. */
  private readonly members = emptyMembers();
  /** A member reference sits in a non-arrow function: buildRenderTree captures `this`. */
  private needsThisAlias = false;
  /** A method group with receiver was bound (C18): the module gets the bind helper. */
  private needsBindMethod = false;
  private readonly componentImports = new Map<string, string>(); // tagName → local name
  private readonly componentLocalNames = new Map<string, string>(); // tagName → local
  private readonly typeImports = new Map<string, string>(); // typeName → local
  private readonly plainImports: string[] = [];
  private readonly seqStack: SeqScope[] = [{ next: 0 }];
  /** Locals declared by loops / inline code — emitted without a `this.` prefix. */
  private readonly locals = new Set<string>();
  private readonly metadata: CodegenResult["metadata"] = { routeTemplates: [], usings: [], imports: [], injects: [], typeParams: [] };
  /** Local names bound by own and inherited `@import`s — free names, never baked to `this.X`. */
  private readonly importedNames = new Set<string>();
  /** The subset of importedNames bound to runtime values (usable as component tags). */
  private readonly importedValues = new Set<string>();
  /** Own `@import` directives to emit verbatim, and the inherited statements that survive shadowing. */
  private readonly ownImportDirectives: Array<{ value: string; pos: SourcePos; valueStart: SourcePos }> = [];
  private readonly inheritedImportLines: string[] = [];
  private inheritsBase = "ComponentBase";

  constructor(
    private readonly options: CodegenOptions,
    private readonly diagnostics: DiagnosticBag,
  ) {}

  run(document: DocumentNode): CodegenResult {
    if (this.options.scopeHash) this.metadata.scopeHash = this.options.scopeHash;
    const directives = document.directives;
    // Imports first: @inject/@inherits types and tags consult the bound names.
    this.collectImports(directives);
    for (const d of directives) {
      switch (d.name) {
        case "import":
          break; // collectImports

        case "page":
          // Multiple @page directives: every template is a route (Blazor).
          this.metadata.routeTemplates.push(unquote(d.value));
          this.metadata.routeTemplate ??= unquote(d.value);
          break;
        case "layout":
          this.metadata.layout = d.value.trim();
          break;
        case "authorize":
          this.metadata.authorize = true;
          break;
        case "using": {
          this.metadata.usings.push(d.value.trim());
          const problem = this.options.resolveUsing?.(d.value.trim()) ?? null;
          if (problem) this.diagnostics.warning("TZS018", d.pos, problem);
          break;
        }
        case "inject": {
          const parts = d.value.trim().split(/\s+/);
          if (parts.length < 2) {
            this.diagnostics.error("TZS001", d.pos, "Usage: @inject <Type> <Name>.");
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
        case "typeparam": {
          // A C# constraint clause (`where T : class`) has no TS meaning; the
          // TS form `@typeparam T extends X` passes through.
          const where = /\s+where\s[\s\S]*$/.exec(d.value);
          if (where) {
            this.diagnostics.warning("TZS014", d.pos, `C# constraint '${where[0].trim()}' ignored — use '@typeparam T extends X'.`);
          }
          this.metadata.typeParams.push(d.value.slice(0, where ? where.index : undefined).trim());
          break;
        }
        case "namespace":
        case "implements":
          // Blazor-only: modules replace namespaces, TS interfaces are structural.
          break;
        case "rendermode":
        case "preservewhitespace":
          this.diagnostics.warning("TZS014", d.pos, `'@${d.name}' is Blazor-only and has no effect in Tsazor.`);
          break;
        default:
          this.diagnostics.error("TZS001", d.pos, `Unknown directive '@${d.name}'.`);
      }
    }

    if (this.metadata.inherits) {
      const base = this.metadata.inherits;
      this.inheritsBase = this.resolveType(base);
    }
    if (this.options.codeBehindClass) {
      if (this.metadata.inherits) {
        this.diagnostics.warning(
          "TZS011",
          document.directives.find((d) => d.name === "inherits")!.pos,
          "… the code-behind file's own base class (X.tsazor.ts) wins — remove the '@inherits' directive.",
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
    if (this.metadata.injects.length > 0) this.runtimeAliases.add("inject");

    // Members come syntactically from the class body, the code-behind class
    // and the @inject fields; base-class members fall under "otherwise ⇒ this.X".
    for (const block of memberCode) collectBodyMembers(block.code, this.members);
    if (this.options.codeBehindSource !== undefined) collectDefaultClassMembers(this.options.codeBehindSource, this.members);
    for (const inject of this.metadata.injects) this.members.instance.add(inject.name);

    // Pre-resolve component tags so imports come out once, before the class.
    this.preResolve(document.body, this.metadata.usings);

    // --- Emit the module -------------------------------------------------
    this.runtimeImports.add("ComponentBase");
    this.runtimeImports.add("RenderTreeBuilder");
    this.runtimeAliases.add("RenderTreeBuilder");
    if (this.metadata.inherits === undefined && this.options.codeBehindClass === undefined) {
      this.runtimeAliases.add("ComponentBase");
      this.inheritsBase = alias("ComponentBase");
    }
    this.line(`/* Generated by @tsazor/compiler from ${this.options.fileName ?? "component"} — do not edit. */`);
    this.line("");
    // The runtime import depends on APIs discovered during body emission
    // (e.g. EventCallback from event handlers), so its line is spliced in
    // after the body has been generated.
    const runtimeImportLine = this.writer.lineCount;

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

    // @import directives: the file's own verbatim (mapped for the LSP), then
    // the inherited ones that no nearer declaration shadows.
    for (const directive of this.ownImportDirectives) this.emitImportDirective(directive);
    for (const imp of this.inheritedImportLines) this.line(imp);
    if (this.ownImportDirectives.length + this.inheritedImportLines.length > 0) this.line("");

    for (const imp of this.options.imports ?? []) this.line(imp);
    if ((this.options.imports ?? []).length > 0) this.line("");

    for (const [ns, spec] of Object.entries(this.options.usingSpecifiers ?? {})) {
      this.line(`import { ${ns} } from "${spec}";`);
    }

    if (this.metadata.routeTemplate) {
      this.line(`export const routeTemplate = ${JSON.stringify(this.metadata.routeTemplate)};`);
      if (this.metadata.routeTemplates.length > 1) {
        this.line(`export const routeTemplates = ${JSON.stringify(this.metadata.routeTemplates)};`);
      }
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
      if (this.metadata.routeTemplates.length > 1) this.line("  static routeTemplates = routeTemplates;");
      if (this.metadata.authorize) this.line("  static routeAuthorize = routeAuthorize;");
      this.line("");
    }
    for (const inject of this.metadata.injects) {
      this.line(`  private readonly ${inject.name} = ${alias("inject")}(${inject.type});`);
    }
    if (this.metadata.injects.length > 0) this.line("");

    // @code blocks verbatim, re-indented into the class.
    for (const block of memberCode) {
      this.commentLine(`/* @code (${this.options.fileName ?? ""}:${block.pos.line}) */`);
      this.emitCodeVerbatim(block.code, block.codeStart ?? { line: block.pos.line, column: 0 }, 2);
      this.line("");
    }

    this.line(`  protected override buildRenderTree(${BUILDER}: ${alias("RenderTreeBuilder")}): void {`);
    const bodyStart = this.writer.lineCount;
    this.emitNodes(renderBody, { line: 0, column: 0 });
    this.line("  }");
    this.line("}");
    this.line("");
    if (this.needsBindMethod) {
      // C18: a method group keeps its receiver (`item.toggle` runs on item).
      this.line(`function ${BIND_METHOD}<T>(receiver: unknown, method: T): T {`);
      this.line(`  return typeof method === "function" ? method.bind(receiver) : method;`);
      this.line("}");
      this.line("");
    }
    // Member references inside non-arrow functions of the render code use
    // the captured component (`this` is rebound there).
    if (this.needsThisAlias) this.writer.insertLines(bodyStart, [`    const ${THIS_ALIAS} = this;`]);

    // Splice the runtime import in at its header position, now that body
    // emission has revealed every runtime API the module uses (the writer
    // shifts the mappings below the insert).
    // Plain names an @import already binds are not imported twice; the
    // generated code's own uses go through hygienic aliases.
    const runtimeNames = [
      ...[...this.runtimeImports].filter((name) => !this.importedNames.has(name)).sort(),
      ...[...this.runtimeAliases].sort().map((name) => `${name} as ${alias(name)}`),
    ];
    if (runtimeNames.length > 0) {
      this.writer.insertLines(runtimeImportLine, [`import { ${runtimeNames.join(", ")} } from "@tsazor/runtime";`, ""]);
    }

    const code = this.writer.toString();
    return { code, mappings: this.takeMappings(), metadata: this.metadata };
  }

  /** Produces the mapping entries for the sourcemap stage. */
  takeMappings(): MapEntry[] {
    return this.writer.mappings;
  }

  /* ------------------------------------------------------------------ */

  private preResolve(nodes: MarkupNode[], usings: string[]): void {
    for (const node of nodes) {
      if (node.kind === "element" && node.isComponent) {
        this.localForComponent(node.tagName, usings, node.pos);
      }
      const nested = childNodes(node);
      if (nested.length > 0) this.preResolve(nested, usings);
    }
  }

  /**
   * Parses the own `@import` directives (TZS016 for invalid forms) and merges
   * the inherited ones: the file's bindings win, then the nearest layer; a
   * shadowed binding is dropped, a repeated side-effect import emitted once.
   */
  private collectImports(directives: readonly DirectiveNode[]): void {
    const sideEffects = new Set<string>();
    const bind = (info: ImportInfo): void => {
      for (const binding of info.bindings) {
        this.importedNames.add(binding.local);
        if (!binding.typeOnly) this.importedValues.add(binding.local);
      }
    };
    for (const d of directives) {
      if (d.name !== "import") continue;
      const parsed = parseImportDirective(d.value);
      if (!parsed.ok) {
        this.diagnostics.error("TZS016", d.pos, parsed.message);
        continue;
      }
      this.metadata.imports.push(parsed.info);
      this.ownImportDirectives.push({ value: d.value, pos: d.pos, valueStart: d.valueStart ?? d.pos });
      if (parsed.info.bindings.length === 0) sideEffects.add(parsed.info.specifier);
      bind(parsed.info);
    }
    for (const inherited of this.options.inheritedImports ?? []) {
      if (inherited.bindings.length === 0) {
        if (sideEffects.has(inherited.specifier)) continue;
        sideEffects.add(inherited.specifier);
        this.inheritedImportLines.push(...importStatements(inherited));
        continue;
      }
      const bindings = inherited.bindings.filter((binding) => !this.importedNames.has(binding.local));
      if (bindings.length === 0) continue;
      const info = { ...inherited, bindings };
      bind(info);
      this.inheritedImportLines.push(...importStatements(info));
    }
  }

  /** Emits an own `@import` verbatim; every line maps back onto the directive value. */
  private emitImportDirective(directive: { value: string; pos: SourcePos; valueStart: SourcePos }): void {
    const prefix = "import ";
    const text = `${prefix}${directive.value}${directive.value.endsWith(";") ? "" : ";"}`;
    const anchors: WriterAnchor[] = [{ offset: 0, srcLine: directive.pos.line - 1, srcCol: directive.pos.column }];
    let offset = prefix.length;
    directive.value.split("\n").forEach((part, index) => {
      anchors.push({
        offset,
        srcLine: directive.valueStart.line - 1 + index,
        srcCol: index === 0 ? directive.valueStart.column : 0,
      });
      offset += part.length + 1;
    });
    this.writer.line(text, anchors);
  }

  private localForComponent(tagName: string, usings: string[], pos: SourcePos): string | null {
    const existing = this.componentLocalNames.get(tagName);
    if (existing !== undefined) return existing;
    // An explicitly imported component class is used as-is.
    if (this.importedValues.has(tagName)) {
      this.componentLocalNames.set(tagName, tagName);
      return tagName;
    }
    const resolved = this.options.resolveComponent?.(tagName, usings) ?? null;
    if (!resolved) {
      this.diagnostics.warning("TZS005", pos, `Component '<${tagName}>' could not be resolved; it will be emitted as an element.`);
      this.componentLocalNames.set(tagName, "__tsazor_unresolved");
      return null;
    }
    if (resolved.ambiguous && resolved.ambiguous.length > 1) {
      this.diagnostics.error(
        "TZS017",
        pos,
        `Component '<${tagName}>' is ambiguous: it resolves in ${resolved.ambiguous.map((source) => `'${source}'`).join(" and ")}. Remove one of the @using directives or @import the component explicitly.`,
      );
    }
    const local = `__tsazor_comp_${tagName.replace(/[^A-Za-z0-9_]/g, "_")}`;
    this.componentLocalNames.set(tagName, local);
    this.componentImports.set(tagName, local);
    return local;
  }

  private resolveType(name: string): string {
    // A generic reference (`Base<number>`) imports its root identifier.
    const root = /^[A-Za-z_$][\w$]*/.exec(name)?.[0] ?? name;
    if (this.typeImports.has(root)) return name;
    // Explicitly imported (e.g. `@import { CounterService } from …`): already bound.
    if (this.importedNames.has(root)) return name;
    const resolved = this.options.resolveType?.(root, this.metadata.usings) ?? null;
    if (resolved) this.typeImports.set(root, root);
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
   * bare member references; TS does not) — see rewrite.ts for the scope rules.
   */
  private expr(code: string, origin?: SourcePos): string {
    return this.exprRewrite(code, origin)?.text ?? code;
  }

  /** expr() with the full rewrite result (method group info); null for empty code. */
  private exprRewrite(code: string, origin?: SourcePos): RewriteResult | null {
    const trimmed = code.trim();
    if (trimmed.length === 0) return null;
    // origin = absolute source position of index 0 of the expression code.
    // Unset (control headers, @bind values) → no token-precise mapping. The
    // trimmed leading whitespace may span lines.
    return this.rewrite(
      trimmed,
      "expression",
      origin === undefined ? undefined : advancePos(origin, code.slice(0, code.length - code.trimStart().length)),
    );
  }

  /** The A4 rule for names no scope of the snippet binds. */
  private readonly resolver: NameResolver = {
    isOuterLocal: (name) => this.locals.has(name),
    prefixFor: (name, thisRebound) => {
      // Statics are reached through the class (C# allows them bare, too).
      if (this.members.statics.has(name) && !this.members.instance.has(name)) return `${this.options.className}.`;
      const receiver = (): string => {
        if (!thisRebound) return "this.";
        this.needsThisAlias = true;
        return `${THIS_ALIAS}.`;
      };
      // A declared member wins over an import or a global of the same name.
      if (this.members.instance.has(name)) return receiver();
      if (this.importedNames.has(name) || LIB_GLOBALS.has(name)) return null;
      return receiver();
    },
  };

  /**
   * Rewrites one snippet. With `origin` (absolute position of code[0]) its
   * word tokens become token-precise pending entries for the next stmt().
   */
  private rewrite(code: string, kind: SnippetKind, origin?: SourcePos): RewriteResult {
    const result = rewriteSnippet(code, kind, this.resolver);
    if (origin !== undefined) {
      this.pendingExprEntries = [];
      let index = 0;
      let pos = origin;
      for (const token of result.tokens) {
        pos = advancePos(pos, code.slice(index, token.srcOffset));
        index = token.srcOffset;
        this.pendingExprEntries.push({ outOffset: token.outOffset, srcLine: pos.line - 1, srcCol: pos.column });
      }
    }
    return result;
  }

  /** Marks EventCallback as used: the generated code binds through its alias. */
  private eventCallback(): string {
    this.runtimeImports.add("EventCallback");
    this.runtimeAliases.add("EventCallback");
    return alias("EventCallback");
  }

  /**
   * An event callback value `EventCallback.bind(this, <handler>)`: the
   * component is the callback's receiver (re-render after the handler,
   * Blazor), and a method group with another receiver (`item.toggle`) keeps
   * that receiver as the handler's `this` (C18) — bound when rendered, like
   * a C# delegate. Pending entries are re-based to the returned text.
   */
  private callbackValue(code: string, start?: SourcePos): string {
    const rewritten = this.exprRewrite(code, start);
    const baked = rewritten?.text ?? code.trim();
    const head = `${this.eventCallback()}.bind(this, `;
    const group = rewritten?.methodGroup;
    if (!group) {
      this.pendingExprEntries = this.pendingExprEntries.map((e) => ({ ...e, outOffset: e.outOffset + head.length }));
      return `${head}${baked})`;
    }
    this.needsBindMethod = true;
    if (group.simpleReceiver) {
      // The receiver is re-evaluated (unmapped); the handler keeps its tokens.
      const pre = `${BIND_METHOD}(${group.receiver}, `;
      this.pendingExprEntries = this.pendingExprEntries.map((e) => ({ ...e, outOffset: e.outOffset + head.length + pre.length }));
      return `${head}${pre}${baked}))`;
    }
    // A receiver with effects is evaluated once: ((r) => bind(r, r.name))(receiver).
    const r = "__tsazor_receiver";
    const pre = `((${r}) => ${BIND_METHOD}(${r}, ${r}.`;
    const name = baked.slice(group.nameOffset, group.nameEnd);
    const mid = `${name}))(`;
    this.pendingExprEntries = this.pendingExprEntries.flatMap((e) => {
      if (e.outOffset >= group.nameOffset && e.outOffset < group.nameEnd) {
        return [{ ...e, outOffset: head.length + pre.length + e.outOffset - group.nameOffset }];
      }
      if (e.outOffset >= group.receiverOffset && e.outOffset < group.receiverOffset + group.receiver.length) {
        return [{ ...e, outOffset: head.length + pre.length + mid.length + e.outOffset - group.receiverOffset }];
      }
      return [];
    });
    return `${head}${pre}${mid}${group.receiver}))`;
  }

  private line(text: string): void {
    this.writer.line(text);
  }

  private commentLine(text: string): void {
    this.line(text);
  }

  private stmt(text: string, pos: SourcePos, expressionStart?: number): void {
    const indent = "    ";
    // Token-precise entries: outOffsets are relative to the expression inside
    // the statement text, so the baked expression's own start offset applies.
    const exprBase = indent.length + (expressionStart ?? 0);
    this.writer.line(indent + text, [
      { offset: indent.length, srcLine: pos.line - 1, srcCol: pos.column },
      ...this.pendingExprEntries.map((p) => ({ offset: exprBase + p.outOffset, srcLine: p.srcLine, srcCol: p.srcCol })),
    ]);
    this.pendingExprEntries = [];
  }

  /**
   * Emits code line by line, re-indented by `indent` spaces. `origin` is the
   * absolute position of code[0]; every line is anchored at its first content
   * (the first line relative to origin's column, later ones at their own
   * column — tabs are kept, so columns stay exact). `tokens` are extra precise
   * entries with outOffsets relative to `code` (baked identifiers).
   */
  private emitCodeVerbatim(code: string, origin: SourcePos, indent: number, tokens: readonly PendingEntry[] = []): void {
    const prefix = " ".repeat(indent);
    const anchors: WriterAnchor[] = [];
    let text = "";
    let lineStart = 0; // offset of the current line within `code`
    let tokenIndex = 0;
    const lines = code.split("\n");
    lines.forEach((line, index) => {
      const pad = line.length > 0 ? prefix : "";
      // Shift from `code` offsets to `text` offsets on this line.
      const shift = text.length + pad.length - lineStart;
      if (line.trim().length > 0) {
        const firstContent = line.length - line.trimStart().length;
        anchors.push({
          offset: shift + lineStart + firstContent,
          srcLine: origin.line - 1 + index,
          srcCol: (index === 0 ? origin.column : 0) + firstContent,
        });
      }
      const lineEnd = lineStart + line.length;
      while (tokenIndex < tokens.length && tokens[tokenIndex]!.outOffset <= lineEnd) {
        const token = tokens[tokenIndex++]!;
        anchors.push({ offset: shift + token.outOffset, srcLine: token.srcLine, srcCol: token.srcCol });
      }
      text += pad + line + (index < lines.length - 1 ? "\n" : "");
      lineStart = lineEnd + 1;
    });
    this.writer.line(text, anchors);
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
        this.stmt(`${BUILDER}.addContent(${this.seq()}, ${JSON.stringify(decodeHtmlEntities(node.content))});`, node.pos);
        break;
      }
      case "directive":
        break; // handled at document level
      case "expression": {
        // Implicit `@expr` code starts right after the '@' and ends at endPos;
        // `@(expr)` starts one further (after the parenthesis).
        const implicitStart = { line: node.pos.line, column: node.pos.column + 1 };
        const implicitEnd = advancePos(implicitStart, node.code);
        const isImplicit = implicitEnd.line === node.endPos.line && implicitEnd.column === node.endPos.column;
        const baked = this.expr(node.code, isImplicit ? implicitStart : { line: node.pos.line, column: node.pos.column + 2 });
        const text = `${BUILDER}.addContent(${this.seq()}, ${baked});`;
        this.stmt(text, node.pos, text.indexOf(baked));
        break;
      }
      case "codeBlock":
        // Inline @{ … } opens no scope (Razor): its statements and locals
        // belong to the enclosing render code.
        this.emitNodes(node.children ?? [], node.pos);
        break;
      case "statement":
        this.emitStatement(node);
        break;
      case "block":
        this.stmt(`{`, node.pos);
        this.withScope(() => this.emitNodes(node.children, node.pos));
        this.stmt(`}`, node.pos);
        break;
      case "while":
        if (node.isDoWhile) {
          this.stmt(`do {`, node.pos);
          this.withScope(() => this.emitNodes(node.children, node.pos));
          const condition = this.headerExpr(node.condition, node.conditionStart);
          const text = `} while (${condition});`;
          this.stmt(text, node.pos, text.indexOf(condition));
        } else {
          const condition = this.headerExpr(node.condition, node.conditionStart);
          const text = `while (${condition}) {`;
          this.stmt(text, node.pos, text.indexOf(condition));
          this.withScope(() => this.emitNodes(node.children, node.pos));
          this.stmt(`}`, node.pos);
        }
        break;
      case "try":
        this.stmt(`try {`, node.pos);
        this.withScope(() => this.emitNodes(node.children, node.pos));
        if (node.catchClause) {
          const clause = node.catchClause;
          this.stmt(clause.param === null ? `} catch {` : `} catch (${clause.param}) {`, clause.span.pos);
          this.withScope(() => {
            if (clause.paramName) this.locals.add(clause.paramName);
            this.emitNodes(clause.children, clause.span.pos);
          });
        }
        if (node.finallyChildren) {
          this.stmt(`} finally {`, node.pos);
          this.withScope(() => this.emitNodes(node.finallyChildren!, node.pos));
        }
        this.stmt(`}`, node.pos);
        break;
      case "textTag":
        this.emitNodes(node.children, node.pos);
        break;
      case "element":
        if (node.isComponent) {
          if (this.componentLocalNames.get(node.tagName) === "__tsazor_unresolved") {
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
          const header = parseForEachHeader(node.code);
          if (header) {
            // C#-style @foreach (var item in items) → for (const item of this.items);
            // `var (k, v) in pairs` destructures → for (const [k, v] of this.pairs).
            const iterableStart = node.codeStart === undefined ? undefined : advancePos(node.codeStart, node.code.slice(0, header.iterableOffset));
            const iterable = this.headerExpr(header.iterable, iterableStart);
            const binding = header.names.length === 1 && !header.destructure ? header.names[0]! : `[${header.names.join(", ")}]`;
            const text = `for (const ${binding} of ${iterable}) {`;
            this.stmt(text, node.pos, text.lastIndexOf(iterable));
            this.withScope(() => {
              for (const name of header.names) this.locals.add(name);
              for (const child of node.children) this.emitNode(child, node.pos);
            });
            this.stmt(`}`, node.pos);
            break;
          }
          this.diagnostics.warning("TZS001", node.pos, "@foreach expects '(variable in iterable)'; falling back to verbatim for-header.");
        }
        // Plain @for: `var` becomes `let` (a binding per iteration, as C#'s
        // loop variable — deferred child content captures its own value);
        // the declared loop variables are locals of the body.
        this.withScope(() => {
          const rewritten = this.rewrite(node.code, "forHeader");
          const header = this.headerLines(node.code, rewritten.text, node.codeStart);
          for (const name of rewritten.declares) this.locals.add(name);
          const text = `for (${header}) {`;
          this.stmt(text, node.pos, text.indexOf(header));
          for (const child of node.children) this.emitNode(child, node.pos);
        });
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
    const open = `${BUILDER}.openElement(${seq}, ${raw});`;
    // Tag token: hovering `<div` maps to the generated tag literal instead of
    // plumbing on a shared anchor (see plumbingStmt); +1 puts the offset inside
    // the string literal.
    this.pendingExprEntries.push({
      outOffset: `${BUILDER}.openElement(`.length + String(seq).length + 2 + 1,
      srcLine: node.pos.line - 1,
      srcCol: node.pos.column + 1,
    });
    this.stmt(open, node.pos);
    if (this.options.scopeHash) {
      this.stmt(`${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(this.options.scopeHash)}, "");`, node.pos);
    }
    if (key && key.kind === "key") this.emitKeyStmt(key, node.pos);
    for (const attr of regular) this.emitAttribute(attr, { tag: name, attributes: regular });
    for (const ref of refs) {
      if (ref.kind !== "ref") continue;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ref.code)) {
        this.diagnostics.error("TZS008", node.pos, "@ref requires a bare property name.");
        continue;
      }
      this.emitRefStmt(ref, node.pos);
    }
    this.emitNodes(node.children, node.pos);
    this.plumbingStmt(`${BUILDER}.closeElement();`);
  }

  /** `@ref="name"` → synthetic `this.name` member capture, token-anchored so
   *  hover/go-to-def on the ref name resolves the captured property. */
  private emitRefStmt(ref: Extract<AttributeNode, { kind: "ref" }>, pos: SourcePos): void {
    const seq = this.seq();
    const text = `${BUILDER}.addElementReferenceCapture(${seq}, (el) => { this.${ref.code} = el; });`;
    if (ref.codeStart !== undefined) {
      this.pendingExprEntries.push({
        outOffset: text.indexOf(`this.${ref.code}`) + "this.".length,
        srcLine: ref.codeStart.line - 1,
        srcCol: ref.codeStart.column,
      });
    }
    this.stmt(text, pos);
  }

  /** `@key="expr"` → `__builder.setKey(...)`, token-precise like attribute values. */
  private emitKeyStmt(key: Extract<AttributeNode, { kind: "key" }>, pos: SourcePos): void {
    const baked = this.expr(key.code, key.codeStart);
    const text = `${BUILDER}.setKey(${baked});`;
    this.stmt(text, pos, text.indexOf(baked));
  }

  private emitComponent(node: ElementNode): void {
    const local = this.localForComponent(node.tagName, this.metadata.usings, node.pos)!;
    const key = node.attributes.find((a) => a.kind === "key");
    const refs = node.attributes.filter((a) => a.kind === "ref");
    const regular = node.attributes.filter((a) => a.kind !== "key" && a.kind !== "ref");
    const hasChildren = node.children.length > 0;

    const seq = this.seq();
    const open = `${BUILDER}.openComponent(${seq}, ${local});`;
    // Tag token: hovering `<AddressEditor` maps to the component local (quick
    // info / go-to-def on the component) instead of plumbing on a shared anchor.
    this.pendingExprEntries.push({
      outOffset: `${BUILDER}.openComponent(`.length + String(seq).length + 2,
      srcLine: node.pos.line - 1,
      srcCol: node.pos.column + 1,
    });
    this.stmt(open, node.pos);
    if (key && key.kind === "key") this.emitKeyStmt(key, node.pos);
    for (const attr of regular) this.emitAttribute(attr, { tag: node.tagName, attributes: regular, isComponent: true });
    for (const ref of refs) {
      if (ref.kind !== "ref") continue;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ref.code)) {
        this.diagnostics.error("TZS008", node.pos, "@ref on components requires a bare property name.");
        continue;
      }
      this.emitRefStmt(ref, node.pos);
    }
    if (hasChildren) {
      this.stmt(`${BUILDER}.addContent(${this.seq()}, (${BUILDER}) => {`, node.pos);
      this.enterScope();
      this.withScope(() => {
        for (const child of node.children) this.emitNode(child, node.pos);
      });
      this.leaveScope();
      this.stmt(`});`, node.pos);
    }
    this.plumbingStmt(`${BUILDER}.closeComponent();`);
  }

  /** Emits a statement whose generated text has NO source mapping: plumbing
   *  lines (closeElement/closeComponent) stay anchor-free so position lookups
   *  from the source (hover, go-to-def) can never land on them — an equal
   *  srcCol anchor of open + close used to let the close entry win every
   *  lookup on the tag line (TsazorGenMap.findSrc takes the last entry
   *  at-or-left). These lines fall back to null → v1 heuristics. */
  private plumbingStmt(text: string): void {
    this.line("    " + text);
  }

  private emitAttribute(attr: AttributeNode, ctx?: { tag: string; attributes: AttributeNode[]; isComponent?: boolean }): void {
    const pos = attr.pos;
    // Token-precise origin of the attribute's value expression: the absolute
    // position of its code text.
    const codeStart = (): SourcePos | undefined => ("codeStart" in attr ? attr.codeStart : undefined);
    switch (attr.kind) {
      case "static": {
        // A minimized attribute is `true` (Razor) — the DOM applier then sets
        // the attribute, also where a same-named DOM property exists
        // (`disabled = ""` would be false).
        const value = attr.minimized ? "true" : JSON.stringify(decodeHtmlEntities(attr.value));
        this.stmt(`${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(attr.name)}, ${value});`, pos);
        break;
      }
      case "expression": {
        // Razor's method-group / lambda conversion: on a component tag, an
        // on*-named attribute value is an event callback. Razor binds method
        // groups AND lambdas to the component instance via the
        // EventCallbackFactory; in TS a bare `this.handler` loses `this`, and
        // an arrow passed as a plain function is bound by the renderer to the
        // nearest component (wrong receiver inside child-content fragments —
        // the owning page would never re-render). So the compiler binds every
        // on*-named component attribute value to `this` up front: the handler
        // runs on the authoring component and its StateHasChanged fires.
        const value = ctx?.isComponent && EVENT_ATTR_PATTERN.test(attr.name)
          ? this.callbackValue(attr.code, codeStart())
          : this.expr(attr.code, codeStart());
        const text = `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(attr.name)}, ${value});`;
        // Precise entries are relative to the value.
        this.stmt(text, pos, text.lastIndexOf(value));
        break;
      }
      case "mixedValue": {
        // Per-part precise entries: rewrite() only fills pendingExprEntries
        // for the part currently being rewritten, so capture and re-offset per
        // part. Offsets are left in stmt-text coordinates — no expressionStart
        // pass. A part that is null/undefined renders empty (Blazor), not "null".
        const precise: PendingEntry[] = [];
        let template = "";
        for (const part of attr.parts) {
          if (part.code !== undefined) {
            this.pendingExprEntries = [];
            const baked = this.expr(part.code, part.codeStart);
            for (const entry of this.pendingExprEntries) {
              precise.push({ ...entry, outOffset: template.length + 3 + entry.outOffset });
            }
            template += `\${(${baked}) ?? ""}`;
          } else {
            template += escapeTemplate(decodeHtmlEntities(part.text ?? ""));
          }
        }
        this.pendingExprEntries = precise;
        const text = `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(attr.name)}, \`${template}\`);`;
        this.stmt(text, pos);
        break;
      }
      case "eventHandler": {
        const callback = this.callbackValue(attr.code, codeStart());
        const flags = attr.flags === 0 ? "" : `, ${attr.flags}`;
        const text = `${BUILDER}.addEventHandler(${this.seq()}, ${JSON.stringify(attr.name)}, ${callback}${flags});`;
        this.stmt(text, pos, text.indexOf(callback));
        break;
      }
      case "attributes": {
        const baked = this.expr(attr.code, codeStart());
        const text = `${BUILDER}.addMultipleAttributes(${this.seq()}, ${baked});`;
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
      this.diagnostics.warning("TZS008", pos, "'@bind:format' has limited v1 support: number and date inputs use native parsing.");
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
      this.diagnostics.error("TZS009", pos, "'@bind' requires an expression.");
      return;
    }

    // Extraction of the DOM value inside the change handler.
    let extract = "(__event.target as HTMLInputElement).value";
    if (isCheckbox) extract = "(__event.target as HTMLInputElement).checked";
    else if (isNumber) extract = "Number((__event.target as HTMLInputElement).value)";
    else if (isDate) extract = "new Date((__event.target as HTMLInputElement).value)";

    const handlerBody = () => {
      const parts: string[] = [];
      if (attr.set !== undefined) {
        parts.push(`(${this.expr(attr.set)})(${extract})`);
      } else {
        const assignmentTarget = this.expr(attr.expression ?? "");
        if (!isAssignableTarget(assignmentTarget)) {
          this.diagnostics.error("TZS008", pos, `@bind requires a settable member expression (got '${assignmentTarget}').`);
        } else if (isCheckbox) {
          parts.push(`${assignmentTarget} = ${extract}`);
        } else if (isNumber) {
          parts.push(`${assignmentTarget} = Number.isNaN(Number((__event.target as HTMLInputElement).value)) ? ${assignmentTarget} : ${extract}`);
        } else if (isDate) {
          parts.push(`${assignmentTarget} = ${extract}`);
        } else {
          parts.push(`${assignmentTarget} = ${extract}`);
        }
      }
      if (attr.after !== undefined) {
        const after = bareIdentifier(attr.after) ? `${this.expr(attr.after)}()` : `(${this.expr(attr.after)})()`;
        parts.push(after);
      }
      return parts.join("; ");
    };

    this.stmt(`${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(valueAttribute)}, ${display});`, pos);
    this.stmt(
      `${BUILDER}.addEventHandler(${this.seq()}, ${JSON.stringify(event)}, ${this.eventCallback()}.bind(this, (__event) => { ${handlerBody()}; }));`,
      pos,
    );
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
      this.diagnostics.error("TZS009", pos, `${label} requires an expression.`);
      return;
    }

    let setter: string;
    if (attr.set !== undefined) {
      setter = `(${this.expr(attr.set)})(__value)`;
    } else {
      const assignmentTarget = this.expr(attr.expression ?? "");
      if (!isAssignableTarget(assignmentTarget)) {
        this.diagnostics.error("TZS008", pos, `${label} requires a settable member expression.`);
        return;
      }
      setter = `${assignmentTarget} = __value`;
    }
    const after = attr.after !== undefined
      ? (bareIdentifier(attr.after) ? `; ${this.expr(attr.after)}()` : `; (${this.expr(attr.after)})()`)
      : "";

    this.stmt(`${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(target)}, ${display});`, pos);
    // InputBase keys EditContext validation on a plain field-name string
    // (v1 contract): derive it from the bound member path — `this.model.name`
    // registers under "name", matching the validators map's field keys.
    if (target === "Value" && attr.get === undefined && attr.set === undefined) {
      const field = lastFieldIdentifier(attr.expression ?? "");
      if (field) {
        this.stmt(`${BUILDER}.addAttribute(${this.seq()}, "ValueExpression", ${JSON.stringify(field)});`, pos);
      }
    }
    this.stmt(
      `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(`${target}Changed`)}, ${this.eventCallback()}.bind(this, (__value) => { ${setter}${after}; }));`,
      pos,
    );
  }

  private emitIf(node: Extract<MarkupNode, { kind: "if" }>): void {
    node.branches.forEach((branch, index) => {
      const prefix = index === 0 ? "if" : branch.condition !== null ? "else if" : "else";
      if (prefix === "else") {
        this.stmt(`else {`, branch.span?.pos ?? node.pos);
      } else {
        const condition = this.headerExpr(branch.condition!, branch.conditionStart);
        const text = `${prefix} (${condition}) {`;
        this.stmt(text, branch.span?.pos ?? node.pos, text.indexOf(condition));
      }
      this.withScope(() => {
        for (const child of branch.children) this.emitNode(child, node.pos);
      });
      this.stmt(`}`, node.pos);
    });
  }

  /**
   * Emits a switch with TS semantics (= C# for stacked labels): an empty
   * section falls through to the next label; a section's statements get a
   * block of their own, and a `break;` when they do not end in a jump (the
   * pre-code-first switch added it implicitly — kept for compatibility).
   */
  private emitSwitch(node: Extract<MarkupNode, { kind: "switch" }>): void {
    const header = this.headerExpr(node.code, node.codeStart);
    const text = `switch (${header}) {`;
    this.stmt(text, node.pos, text.indexOf(header));
    for (const c of node.cases) {
      const label = c.code === null ? "default:" : `case ${this.expr(c.code)}:`;
      if (c.children.length === 0) {
        this.stmt(label, c.span.pos);
        continue;
      }
      this.stmt(`${label} {`, c.span.pos);
      this.withScope(() => {
        for (const child of c.children) this.emitNode(child, node.pos);
      });
      if (!endsWithJump(c.children)) this.stmt(`break;`, c.span.pos);
      this.stmt(`}`, c.span.pos);
    }
    this.stmt(`}`, node.pos);
  }

  /** A statement run in a code context: verbatim TS (members baked), its
   *  declarations registered as locals for the rest of the enclosing scope. */
  private emitStatement(node: StatementNode): void {
    // Registered first: destructuring/function names inside the run itself
    // must stay bare too.
    for (const name of node.declares) this.locals.add(name);
    // Rewriting inserts `this.` prefixes, so its per-token entries keep the
    // columns after each prefix exact.
    const baked = this.rewrite(node.code, "statements", node.pos).text;
    const tokens = this.pendingExprEntries;
    this.pendingExprEntries = [];
    this.emitCodeVerbatim(baked, node.pos, 4, tokens);
  }

  /** Runs `emit` in a nested local scope: locals it declares vanish after. */
  private withScope(emit: () => void): void {
    const saved = [...this.locals];
    emit();
    this.locals.clear();
    for (const name of saved) this.locals.add(name);
  }

  /**
   * Bakes a control header (`if`/`for`/`while`/`switch` condition). Headers
   * stay at statement granularity (no token entries), but a multi-line header
   * anchors each continuation line at its first content — registered as
   * pending entries for the next stmt(), relative to the baked text.
   */
  private headerExpr(code: string, start: SourcePos | undefined): string {
    return this.headerLines(code, this.expr(code), start);
  }

  /** Continuation-line anchors of a rewritten header (see headerExpr). */
  private headerLines(code: string, baked: string, start: SourcePos | undefined): string {
    if (start === undefined || !code.includes("\n")) return baked;
    const rawLines = code.split("\n");
    let outOffset = 0;
    baked.split("\n").forEach((line, index) => {
      if (index > 0) {
        const raw = rawLines[index] ?? "";
        const bakedLead = line.length - line.trimStart().length;
        if (line.trim().length > 0) {
          this.pendingExprEntries.push({
            outOffset: outOffset + bakedLead,
            srcLine: start.line - 1 + index,
            srcCol: raw.length - raw.trimStart().length,
          });
        }
      }
      outOffset += line.length + 1;
    });
    return baked;
  }
}

/** Whether a switch section ends in a jump (`break`, `return`, `continue`, `throw`). */
function endsWithJump(children: MarkupNode[]): boolean {
  const last = children[children.length - 1];
  if (last?.kind !== "statement") return false;
  const code = last.code.replace(/\/\/[^\n]*$/gm, "").trim();
  const lastLine = code.split(/[;\n]\s*(?=\S)/).pop() ?? "";
  return /^(break|continue|return|throw)\b/.test(lastLine.trim());
}

/**
 * C#-style @foreach headers: `var x in xs`, `string s in xs` (typed C#
 * variable), `let x in xs`, and deconstruction `var (k, v) in pairs`.
 * `iterableOffset` = offset of the iterable within `code`.
 */
function parseForEachHeader(code: string): { names: string[]; destructure: boolean; iterable: string; iterableOffset: number } | null {
  const tuple = /^\s*(?:var\s*)?\(\s*([^)]*)\)\s+in\s+/.exec(code);
  if (tuple) {
    // `(k, v)` or typed `(string k, int v)` → the names.
    const names = tuple[1]!.split(",").map((part) => part.trim().split(/\s+/).pop() ?? "");
    if (names.length === 0 || !names.every((n) => /^[A-Za-z_$][\w$]*$/.test(n))) return null;
    return { names, destructure: true, iterable: code.slice(tuple[0].length).trim(), iterableOffset: tuple[0].length };
  }
  const single = /^\s*(?:(?:var|let|const)\s+|[A-Za-z_$][\w$.]*(?:<[^()]*>)?(?:\[\])*\??\s+)?([A-Za-z_$][\w$]*)\s+in\s+/.exec(code);
  if (!single) return null;
  const iterable = code.slice(single[0].length);
  if (iterable.trim().length === 0) return null;
  return { names: [single[1]!], destructure: false, iterable: iterable.trim(), iterableOffset: single[0].length };
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

/** The bound member path's field name for EditContext validation: the last
 *  identifier of `this.model.name` → "name", `model.age` → "age". Bare
 *  identifiers bind their own name; computed/indexed paths yield nothing. */
function lastFieldIdentifier(code: string): string | undefined {
  const target = code.trim();
  if (!isAssignableTarget(target)) return undefined;
  const last = target.split(".").pop()!;
  return last.length > 0 ? last : undefined;
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