import type {
  AttributeNode,
  CodeBlockNode,
  DirectiveNode,
  DocumentNode,
  ElementNode,
  ForNode,
  MarkupNode,
  StatementNode,
} from "./ast.js";
import { childNodes } from "./ast.js";
import { DiagnosticBag, type DiagnosticFix, type SourcePos, type SourceRange, type TextEdit } from "./diagnostics.js";
import { decodeHtmlEntities } from "./entities.js";
import { LIB_GLOBALS } from "./globals.generated.js";
import { directiveReplacementOf, parseAttributeLists, parseAuthorizeArgument, typescriptFormOf, type AuthorizeRequirement } from "./attributes.js";
import { firstInterpolatedSpan, interpolatedStringFix } from "./interpolated.js";
import { importStatements, parseImportDirective, type ImportInfo } from "./imports.js";
import type { ComponentMetadata, ComponentParameter, ParameterCategory, TypeReference } from "./metadata.js";
import { componentTarget, findParameter, suggestParameter, uncertainReason, type ComponentTarget } from "./component-params.js";
import { RUNTIME_MODULE, replaceIdentifiers } from "./metadata.js";
import {
  bodyMemberOffset,
  checkBindTarget,
  collectBodyMembers,
  collectDefaultClassMembers,
  emptyMembers,
  forHeaderKind,
  rewriteSnippet,
  typeSyntaxError,
  type NameResolver,
  type RewriteResult,
  type SnippetKind,
} from "./rewrite.js";
import { advancePos, CodeWriter, type WriterAnchor } from "./writer.js";
import * as ts from "typescript";

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
  /**
   * Parameter metadata of the component a tag resolves to (2.1; the
   * workspace resolver provides it). `imports` are the file's own `@import`s
   * (an imported tag binds directly). Drives the lowering of component
   * attributes (2.2): by the target parameter's category, unknown parameters
   * are errors (TZS025), and `<X>Expression` of a component bind is passed
   * only when declared. Without metadata (or for an `uncertain` parameter)
   * attributes are lowered as written — plain text as a string, `On*` values
   * as EventCallbacks — with a TZS026 warning when the resolver ran.
   */
  resolveComponentMetadata?: (tagName: string, usings: string[], imports?: readonly ImportInfo[]) => ComponentMetadata | null;
  /**
   * Shadow-layer emission (2.4): typed slot contexts, `satisfies`-checks on
   * attribute values and `import type` lines for the parameter types. Never
   * set for real builds — their output stays byte-identical (except @ref on a
   * component tag, which lowers to the component capture in both modes).
   */
  typedShadow?: {
    /**
     * Resolved type arguments of a generic component tag (`TItem` → type
     * text), keyed by the tag's source position `"line:column"` — provided
     * by the type-service inference pass (2.4).
     */
    typeArguments?: ReadonlyMap<string, ReadonlyMap<string, string>>;
    /**
     * Rebases a parameter type's import reference (declared in another
     * module) to a specifier the consuming shadow module can resolve;
     * undefined drops the check for that parameter.
     */
    rebaseTypeImport?: (reference: TypeReference) => string | undefined;
  };
}

/** 2.4: one `TItem` inference request of the shadow layer — the type-service
 *  resolves the parameter's used type against the attribute value's real type
 *  and recompiles the shadow with the substitution. */
export interface TypedTagInferenceRequest {
  /** Stable id of the tag instance: `${line}:${column}` (1-based `<Tag` position). */
  tagId: string;
  tagName: string;
  /** The type parameter this request infers. */
  typeParameter: string;
  /** The parameter the inference anchors on (its declared type uses the type parameter). */
  parameterName: string;
  /** The parameter's declared type text, as written. */
  parameterType: string;
  /** Where the attribute's value expression starts in the source. */
  value: SourcePos;
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
    /** @authorize on a @page → protected route. */
    authorize?: boolean;
    /** Roles/policy of `@authorize({ roles: […], policy: "…" })` (the
     *  route's AuthorizationRequirements); absent = authentication suffices. */
    authorizeData?: { roles?: string[]; policy?: string };
    usings: string[];
    /** The file's own `@import` directives, parsed (invalid ones are dropped). */
    imports: ImportInfo[];
    injects: Array<{ type: string; name: string }>;
    typeParams: string[];
    inherits?: string;
    /** Uppercase tags that resolved to nothing (TZS005) — HMR: when such a
     *  tag's component file appears, dependents re-transform (4.1). */
    unresolvedTags: string[];
    /** Echo of options.scopeHash (scoped-CSS attribute name), when set. */
    scopeHash?: string;
    /** Echo of options.codeBehindClass (sibling X.tsazor.ts base class), when set. */
    codeBehindClass?: string;
  };
  /** 2.4: the tag-level TItem inference requests (shadow layer only). */
  typedInference?: readonly TypedTagInferenceRequest[];
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

/**
 * Component attributes whose name marks them as event callbacks (On*, on*) —
 * only where the target parameter's category is unknown (no metadata, or an
 * `uncertain` type); otherwise the category decides (2.2).
 */
const EVENT_ATTR_PATTERN = /^on/i;

/** The attribute kinds a component lowers by its parameter's category. */
type ValueAttribute = Extract<AttributeNode, { kind: "static" | "expression" | "mixedValue" }>;

/**
 * Where an attribute is emitted: the tag, its attributes, for a component tag
 * its target — and, once the attribute is matched, its parameter's category
 * (absent: unknown, the value is lowered as written).
 */
interface AttributeContext {
  tag: string;
  attributes: AttributeNode[];
  isComponent?: boolean;
  component?: ComponentTarget;
  category?: ParameterCategory;
  /** 2.4: the typed shadow's `satisfies`-type for the value (component string parameters). */
  checkType?: string;
}

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
const alias = (name: string): string => `__tsazor_${name}`;
const BIND_METHOD = alias("bindMethod");
const FORMAT_VALUE = alias("formatValue");
const FORMAT_PARSE = alias("parseValue");

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
  /** Parameter metadata per component tag (2.2), and the tags already warned about missing metadata. */
  private readonly componentTargets = new Map<string, ComponentTarget>();
  /**
   * Child content elements (2.3, C13): a direct child of a component whose
   * tag names one of its RenderFragment / RenderFragment<T> parameters —
   * decided by the parent's metadata before any tag resolution (Razor:
   * child content tag helpers win over components of the same name).
   */
  private readonly slotElements = new Map<ElementNode, ComponentParameter>();
  /** Uppercase tags already reported as misplaced or unknown child content (no TZS005 on top). */
  private readonly diagnosedTags = new Set<ElementNode>();
  /** Template contexts of the enclosing RenderFragment<T> bodies (RZ9999: no reuse of a name). */
  private readonly contextStack: Array<{ name: string; element: string; component: string }> = [];
  private readonly unavailableWarned = new Set<string>();
  private readonly typeImports = new Map<string, string>(); // typeName → local
  private readonly plainImports: string[] = [];
  private readonly seqStack: SeqScope[] = [{ next: 0 }];
  /** Locals declared by loops / inline code — emitted without a `this.` prefix —
   *  and how they were declared (a `@bind` cannot target the read-only ones). */
  private readonly locals = new Map<string, LocalKind>();
  private readonly metadata: CodegenResult["metadata"] = { routeTemplates: [], usings: [], imports: [], injects: [], typeParams: [], unresolvedTags: [] };
  /** Local names bound by own and inherited `@import`s — free names, never baked to `this.X`. */
  private readonly importedNames = new Set<string>();
  /** `@import`-ed names bound to @tsazor/runtime — local name → exported name
   *  — the module the markup rewrites recognize against (MarkupString, 3.3).
   *  Bindings shadowing a runtime name from another module (a local class
   *  `MarkupString`?) are not rewritten. */
  private readonly runtimeBoundNames = new Map<string, string>();
  /* Typed shadows (2.4) — shadow-layer state, only under options.typedShadow. */
  /** The resolved type arguments of the component tag being emitted. */
  private tagTypeArgs?: ReadonlyMap<string, string>;
  /** The component's type-parameter order (for `Local<A, B>` suffixes). */
  private tagTypeArgsOrder: readonly string[] | undefined;
  /** `import type` lines the shadow module needs for the parameter types. */
  private readonly shadowTypeImports = new Map<string, { specifier: string; imported?: string }>();
  private readonly inferenceRequests: TypedTagInferenceRequest[] = [];
  /** The subset of importedNames bound to runtime values (usable as component tags). */
  private readonly importedValues = new Set<string>();
  /** Own `@import` directives to emit verbatim, and the inherited statements that survive shadowing. */
  private readonly ownImportDirectives: Array<{ value: string; pos: SourcePos; valueStart: SourcePos }> = [];
  private readonly inheritedImportLines: string[] = [];
  private inheritsBase = "ComponentBase";
  /** `@attribute @decorator(…)` directives, emitted on the class. */
  private readonly decorators: DirectiveNode[] = [];
  /** Requirements of each `@authorize` (all must pass, like Blazor's several `[Authorize]`). */
  private readonly authorizeRequirements: Array<AuthorizeRequirement & { range: SourceRange }> = [];

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
          this.authorizeDirective(d);
          break;
        case "attribute":
          this.attributeDirective(d);
          break;
        case "using": {
          this.metadata.usings.push(d.value.trim());
          const problem = this.options.resolveUsing?.(d.value.trim()) ?? null;
          if (problem) this.diagnostics.warning("TZS018", directiveRange(d), problem);
          break;
        }
        case "inject": {
          const parts = d.value.trim().split(/\s+/);
          if (parts.length < 2) {
            this.diagnostics.error("TZS001", directiveRange(d), "Usage: @inject <Type> <Name>.");
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
          // The TS form `@typeparam T extends X` passes through; a C# constraint
          // clause (`where T : IItem`) is TZS021 (the name alone is kept for recovery).
          const where = /\s+where\s[\s\S]*$/.exec(d.value);
          if (where) {
            const name = d.value.slice(0, where.index).trim();
            const constraint = /^where\s+[A-Za-z_]\w*\s*:\s*([A-Za-z_][\w.]*(?:<[^>]*>)?)\s*$/.exec(where[0].trim())?.[1];
            const typed = constraint !== undefined && !["class", "struct", "notnull", "unmanaged", "new"].includes(constraint);
            const form = typed ? `'@typeparam ${name} extends ${constraint}'` : `'@typeparam ${name} extends X' (TypeScript constraints are types)`;
            // The range is the clause itself (`where T : IItem`).
            const clauseOffset = where.index + where[0].length - where[0].trimStart().length;
            const clause = textRange(advancePos(d.valueStart ?? d.pos, d.value.slice(0, clauseOffset)), where[0].trim());
            const fix: DiagnosticFix | undefined = typed
              ? { title: `Use 'extends ${constraint}'`, edits: [{ ...clause, text: `extends ${constraint}` }] }
              : undefined;
            this.diagnostics.error("TZS021", clause, `C# constraint '${where[0].trim()}' — use ${form}.`, fix);
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
          this.diagnostics.warning("TZS014", directiveRange(d), `'@${d.name}' is Blazor-only and has no effect in Tsazor.`);
          break;
        default:
          this.diagnostics.error("TZS001", directiveRange(d), `Unknown directive '@${d.name}'.`);
      }
    }
    this.resolveAuthorization();

    if (this.metadata.inherits) {
      const base = this.metadata.inherits;
      this.inheritsBase = this.resolveType(base);
    }
    if (this.options.codeBehindClass) {
      if (this.metadata.inherits) {
        this.diagnostics.warning(
          "TZS011",
          directiveRange(document.directives.find((d) => d.name === "inherits")!),
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
    this.checkRenderMethodConflict(memberCode);

    // Pre-resolve component tags so imports come out once, before the class.
    this.classifyChildContent(document.body);
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
      if (this.metadata.authorize) this.line(`export const routeAuthorize = ${this.metadata.authorizeData ? JSON.stringify(this.metadata.authorizeData) : "true"};`);
      this.line("");
    }

    const typeParams = this.metadata.typeParams;
    const typeDecl = typeParams.length > 0 ? `<${typeParams.join(", ")}>` : "";
    // `@attribute @decorator(…)`: a real class decorator (mapped for the LSP).
    for (const decorator of this.decorators) {
      const start = decorator.valueStart ?? decorator.pos;
      this.writer.line(decorator.value.trim(), [{ offset: 0, srcLine: start.line - 1, srcCol: start.column }]);
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
    // C18: a method group keeps its receiver (`item.toggle` runs on item); the
    // runtime caches the bound function per (receiver, method).
    if (this.needsBindMethod) this.runtimeAliases.add("bindMethod");
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

    // 2.4: the typed checks referenced types the shadow module must import
    // from other modules (the `rebaseTypeImport` lookup collected them) —
    // they join the runtime import's spliced header position.
    if (this.shadowTypeImports.size > 0) {
      const lines = [...this.shadowTypeImports.entries()].map(([name, imp]) =>
        imp.imported !== undefined
          ? `import type { ${imp.imported} as ${name} } from "${imp.specifier}";`
          : `import type ${name} from "${imp.specifier}";`);
      this.writer.insertLines(runtimeImportLine, [...lines, ""]);
    }

    const code = this.writer.toString();
    return {
      code,
      mappings: this.takeMappings(),
      metadata: this.metadata,
      ...(this.options.typedShadow !== undefined && this.inferenceRequests.length > 0 ? { typedInference: this.inferenceRequests } : {}),
    };
  }

  /**
   * `@attribute` (C19). The TS form `@attribute @decorator(…)` decorates the
   * class. A C# attribute list has no TS meaning: each attribute is TZS021
   * naming its TS form (`[Authorize(Roles = "A")]` ⇒ `@authorize({ roles:
   * ["A"] })`, see typescriptFormOf).
   */
  private attributeDirective(d: DirectiveNode): void {
    const value = d.value.trim();
    if (value.startsWith("@")) {
      this.decorators.push(d);
      return;
    }
    const attributes = parseAttributeLists(value);
    if (attributes === null) {
      this.diagnostics.error("TZS019", directiveValueRange(d), "Expected a TS class decorator ('@attribute @decorator(…)').");
      return;
    }
    const range = directiveRange(d);
    for (const attribute of attributes) {
      // A single attribute with a mechanical TS form replaces the whole
      // directive (a removal takes its line break along).
      const replacement = attributes.length === 1 ? directiveReplacementOf(attribute) : null;
      const fix: DiagnosticFix | undefined = replacement === null
        ? undefined
        : replacement === ""
          ? { title: `Remove '@attribute [${attribute.written}]'`, edits: [{ pos: d.pos, endPos: { line: d.pos.line + 1, column: 0 }, text: "" }] }
          : { title: `Use '${replacement}'`, edits: [{ ...range, text: replacement }] };
      this.diagnostics.error("TZS021", range, `C# attribute '[${attribute.written}]' — use ${typescriptFormOf(attribute)}.`, fix);
    }
  }

  /** `@authorize` / `@authorize({ roles: […], policy: "…" })` (TS object literal, literal values). */
  private authorizeDirective(d: DirectiveNode): void {
    const requirement = parseAuthorizeArgument(d.value);
    if (typeof requirement === "string") {
      this.diagnostics.error("TZS019", directiveValueRange(d), `Invalid @authorize: ${requirement}.`);
      return;
    }
    this.authorizeRequirements.push({ ...requirement, range: directiveRange(d) });
  }

  /**
   * C21: every .tsazor generates `buildRenderTree` — also one without markup,
   * as Razor generates BuildRenderTree for every .razor — so a hand-written
   * one in `@code` or in the code-behind class conflicts (Blazor: CS0111
   * duplicate member). Hand-written render code belongs in a plain `.ts`
   * component class.
   */
  private checkRenderMethodConflict(memberCode: CodeBlockNode[]): void {
    const hint = "Every .tsazor file generates buildRenderTree (also without markup) — write markup instead, or make it a plain .ts component class.";
    for (const block of memberCode) {
      const offset = bodyMemberOffset(block.code, "buildRenderTree");
      if (offset === undefined) continue;
      const pos = block.codeStart ? advancePos(block.codeStart, block.code.slice(0, offset)) : block.pos;
      this.diagnostics.error("TZS020", textRange(pos, "buildRenderTree"), `'buildRenderTree' in @code duplicates the generated member. ${hint}`);
    }
    if (this.options.codeBehindSource !== undefined) {
      const codeBehind = emptyMembers();
      collectDefaultClassMembers(this.options.codeBehindSource, codeBehind);
      if (codeBehind.instance.has("buildRenderTree")) {
        // The member lives in the code-behind file: reported at the start of this one.
        this.diagnostics.error("TZS020", textRange({ line: 1, column: 0 }, ""), `'buildRenderTree' in the code-behind class would be replaced by the generated member. ${hint}`);
      }
    }
  }

  /** Merges the `@authorize` directives into the route metadata. */
  private resolveAuthorization(): void {
    if (this.authorizeRequirements.length === 0) return;
    this.metadata.authorize = true;
    const withRoles = this.authorizeRequirements.filter((a) => a.roles !== undefined);
    const withPolicy = this.authorizeRequirements.filter((a) => a.policy !== undefined);
    // Every @authorize must pass (Blazor ANDs several [Authorize]);
    // AuthorizationRequirements holds one role set and one policy, so a
    // second of either cannot be represented — refused instead of weakening
    // the check.
    for (const extra of [...withRoles.slice(1), ...withPolicy.slice(1)]) {
      this.diagnostics.error("TZS019", extra.range, "Several @authorize with roles (or with a policy) cannot be combined — use one role list and one policy.");
    }
    const roles = withRoles[0]?.roles;
    const policy = withPolicy[0]?.policy;
    if (roles !== undefined || policy !== undefined) {
      this.metadata.authorizeData = { ...(roles !== undefined ? { roles } : {}), ...(policy !== undefined ? { policy } : {}) };
    }
  }

  /** Produces the mapping entries for the sourcemap stage. */
  takeMappings(): MapEntry[] {
    return this.writer.mappings;
  }

  /* ------------------------------------------------------------------ */

  /**
   * Slot vs. component (2.3, C13), decided by metadata: a direct child of a
   * component whose tag names a RenderFragment / RenderFragment<T> parameter
   * of that component is a child content element — even where a component
   * of the same name exists (Razor's ComponentLoweringPass rewrites a
   * ChildContent tag helper at its parent before the component fallback
   * runs). Elsewhere a tag is a component (or an element). Unresolvable
   * uppercase tags that look like child content are reported here: a known
   * slot name in the wrong place (TZS027), a misspelled slot under a
   * component with complete metadata (TZS025), a non-fragment parameter
   * written as an element (TZS028). Without metadata nothing changes.
   */
  private classifyChildContent(body: MarkupNode[]): void {
    const usings = this.metadata.usings;
    const resolvable = (tag: string): boolean => this.importedValues.has(tag) || (this.options.resolveComponent?.(tag, usings) ?? null) !== null;
    // Every fragment parameter of the components this file uses: a slot
    // name written outside its component is recognizable as one.
    const slotOwners = new Map<string, string>();
    const collect = (nodes: MarkupNode[]): void => {
      for (const node of nodes) {
        if (node.kind === "element" && node.isComponent && resolvable(node.tagName)) {
          for (const parameter of this.componentTargetFor(node.tagName).metadata?.parameters ?? []) {
            if (isFragment(parameter) && !slotOwners.has(parameter.name.toLowerCase())) slotOwners.set(parameter.name.toLowerCase(), node.tagName);
          }
        }
        collect(childNodes(node));
      }
    };
    collect(body);

    const walk = (nodes: MarkupNode[], parent: ComponentTarget | null, ancestors: readonly ComponentTarget[]): void => {
      for (const node of nodes) {
        if (node.kind !== "element") {
          walk(childNodes(node), null, ancestors);
          continue;
        }
        if (!node.isComponent) {
          walk(node.children, null, ancestors);
          continue;
        }
        const declared = parent?.metadata ? findParameter(parent.metadata, node.tagName) : undefined;
        if (declared && isFragment(declared)) {
          this.slotElements.set(node, declared);
          walk(node.children, null, ancestors);
          continue;
        }
        if (resolvable(node.tagName)) {
          const target = this.componentTargetFor(node.tagName);
          walk(node.children, target, [...ancestors, target]);
          continue;
        }
        this.diagnoseUnresolvedChild(node, parent, ancestors, declared, slotOwners);
        walk(node.children, null, ancestors);
      }
    };
    walk(body, null, []);
  }

  /** An unresolvable uppercase tag that names child content of another component (see classifyChildContent). */
  private diagnoseUnresolvedChild(
    node: ElementNode,
    parent: ComponentTarget | null,
    ancestors: readonly ComponentTarget[],
    declared: ComponentParameter | undefined,
    slotOwners: ReadonlyMap<string, string>,
  ): void {
    const range = tagNameRange(node);
    const tag = node.tagName;
    const report = (code: "TZS025" | "TZS027" | "TZS028", message: string, fix?: DiagnosticFix): void => {
      this.diagnostics.error(code, range, message, fix);
      this.diagnosedTags.add(node);
    };
    if (declared && parent) {
      report("TZS028", `'${declared.name}' is a ${declared.category} parameter of '<${parent.tag}>': only RenderFragment parameters are set by child content elements — set it as an attribute ('${tag}="…"').`);
      return;
    }
    const owner = [...ancestors].reverse().find((a) => a.metadata && findParameter(a.metadata, tag) && isFragment(findParameter(a.metadata, tag)!));
    if (owner) {
      report("TZS027", `'<${tag}>' is child content of '<${owner.tag}>' and must be its direct child (not nested in markup or a code block).`);
      return;
    }
    if (parent?.metadata && parent.complete) {
      const fragments = parent.metadata.parameters.filter(isFragment);
      if (fragments.length > 0) {
        const suggestion = suggestParameter({ ...parent.metadata, parameters: fragments }, tag);
        const fix: DiagnosticFix | undefined = suggestion
          ? { title: `Rename to '${suggestion}'`, edits: elementNameEdits(node, suggestion) }
          : undefined;
        report(
          "TZS025",
          `Component '${parent.tag}' does not have a child content parameter '${tag}' (and no component '${tag}' resolves).${suggestion ? ` Did you mean '${suggestion}'?` : ` It accepts: ${fragments.map((p) => `'${p.name}'`).join(", ")}.`}`,
          fix,
        );
        return;
      }
    }
    const declaredBy = slotOwners.get(tag.toLowerCase());
    if (declaredBy) report("TZS027", `'<${tag}>' is child content of '<${declaredBy}>' and can only be used as its direct child.`);
  }

  private preResolve(nodes: MarkupNode[], usings: string[]): void {
    for (const node of nodes) {
      if (node.kind === "element" && node.isComponent && !this.slotElements.has(node) && !this.diagnosedTags.has(node)) {
        this.localForComponent(node.tagName, usings, tagNameRange(node));
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
        if (info.specifier === RUNTIME_MODULE) this.runtimeBoundNames.set(binding.local, binding.imported ?? binding.local);
        else this.runtimeBoundNames.delete(binding.local);
      }
    };
    for (const d of directives) {
      if (d.name !== "import") continue;
      const parsed = parseImportDirective(d.value);
      if (!parsed.ok) {
        this.diagnostics.error("TZS016", directiveRange(d), parsed.message);
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

  private localForComponent(tagName: string, usings: string[], pos: SourceRange): string | null {
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
      this.metadata.unresolvedTags.push(tagName);
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
  private expr(code: string, origin?: SourcePos, syntaxAt: SourcePos | undefined = origin): string {
    return this.exprRewrite(code, origin, syntaxAt)?.text ?? code;
  }

  /**
   * expr() with the full rewrite result (method group info); null for empty
   * code. `syntaxAt` (default: origin) is where the code starts for its
   * syntax errors (TZS024) — also set where the mapping stays coarse.
   */
  private exprRewrite(code: string, origin?: SourcePos, syntaxAt: SourcePos | undefined = origin): RewriteResult | null {
    const trimmed = code.trim();
    if (trimmed.length === 0) return null;
    // origin = absolute source position of index 0 of the expression code.
    // Unset (control headers, @bind values) → no token-precise mapping. The
    // trimmed leading whitespace may span lines.
    const lead = code.slice(0, code.length - code.trimStart().length);
    const result = this.rewrite(trimmed, "expression", origin === undefined ? undefined : advancePos(origin, lead));
    if (syntaxAt !== undefined) this.reportSyntax("TZS024", result, trimmed, advancePos(syntaxAt, lead));
    return result;
  }

  /** The first syntax error of a rewritten snippet (later ones usually follow
   *  from it). A C# interpolated/verbatim string is the common cause — TZS024
   *  gets its mechanical rewrite (template literal) as an A7 fix. */
  private reportSyntax(code: "TZS015" | "TZS024", result: RewriteResult, text: string, start: SourcePos): void {
    const first = result.syntaxErrors[0];
    if (!first) return;
    const at = advancePos(start, text.slice(0, first.offset));
    const range = textRange(at, text.slice(first.offset, first.offset + first.length));
    const fix = interpolatedStringFix(text, start);
    if (fix === undefined) {
      this.diagnostics.error(code, range, first.message);
      return;
    }
    const quoted = firstInterpolatedSpan(text)!;
    this.diagnostics.error(code, range, `${quoted.startsWith("$") ? "C# interpolated string" : "C# verbatim string"} ${quoted} — use a template literal. (${first.message})`, fix);
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

  /**
   * 3.3 MarkupString: recognizes markup content that renders unescaped —
   * `new MarkupString(inner)` and `inner as MarkupString` (the analogue of
   * C# `(MarkupString)s`) — and returns the inner expression with the position
   * it starts at, so the emitted `addMarkupContent` keeps the source anchors.
   * null when the expression is not a MarkupString form or the name is not
   * bound to @tsazor/runtime via `@import` (a same-named local type is never
   * rewritten).
   */
  private markupStringContent(code: string, origin: SourcePos): { inner: string; origin: SourcePos } | null {
    const runtimeMarkupBound = [...this.runtimeBoundNames.entries()].some(([, exported]) => exported === "MarkupString");
    if (!runtimeMarkupBound) return null;
    const source = ts.createSourceFile("markup.tsazor.expr", code, ts.ScriptTarget.Latest, false);
    if (source.statements.length !== 1 || !ts.isExpressionStatement(source.statements[0]!)) return null;
    const expression = source.statements[0]!.expression;
    const isRuntimeMarkup = (name: string): boolean => this.runtimeBoundNames.get(name) === "MarkupString";
    const markupCtor = (e: ts.Expression): e is ts.NewExpression =>
      ts.isNewExpression(e) && ts.isIdentifier(e.expression) && isRuntimeMarkup(e.expression.text) &&
      e.arguments !== undefined && e.arguments.length > 0;
    /** A plain type name (no generic arguments). */
    const typeNameOf = (type: ts.TypeNode): string | undefined =>
      ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName) ? type.typeName.text : undefined;
    let inner: ts.Expression | undefined;
    if (markupCtor(expression)) {
      inner = expression.arguments![0]!;
    } else if (ts.isAsExpression(expression) && isRuntimeMarkup(typeNameOf(expression.type) ?? "")) {
      const target = expression.expression;
      if (markupCtor(target)) inner = target.arguments![0]!;
      else inner = target;
    }
    if (inner === undefined) return null;
    const start = inner.getStart(source);
    const slice = code.slice(start, inner.getEnd());
    const innerCode = slice.trim();
    return {
      inner: innerCode,
      origin: advancePos(origin, code.slice(0, start) + slice.slice(0, slice.length - innerCode.length)),
    };
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
    const bound = rewritten?.methodGroup ? this.boundMethodGroup(rewritten, baked) : baked;
    this.pendingExprEntries = this.pendingExprEntries.map((e) => ({ ...e, outOffset: e.outOffset + head.length }));
    return `${head}${bound})`;
  }

  /**
   * A value for a delegate parameter (a function type that is not an
   * EventCallback): a method group becomes a function bound to its receiver,
   * like a C# delegate — a member method (`isVisible` ⇒ bound to this
   * component; also a name the component does not declare, i.e. an inherited
   * member) or a method group with a receiver (`svc.isVisible`, as for
   * EventCallbacks). Lambdas, calls, declared fields and accessors, and any
   * other expression stay plain TypeScript. The runtime caches the bound
   * function per (receiver, method), so it is the same function every render.
   */
  private delegateValue(code: string, start?: SourcePos): string {
    const rewritten = this.exprRewrite(code, start);
    const baked = rewritten?.text ?? code.trim();
    if (rewritten?.methodGroup) return this.boundMethodGroup(rewritten, baked);
    const name = code.trim();
    const isMemberMethod = bareIdentifier(name) && baked === `this.${name}` &&
      (this.members.methods.has(name) || !this.members.instance.has(name));
    if (!isMemberMethod) return baked;
    this.needsBindMethod = true;
    const pre = `${BIND_METHOD}(this, `;
    this.pendingExprEntries = this.pendingExprEntries.map((e) => ({ ...e, outOffset: e.outOffset + pre.length }));
    return `${pre}${baked})`;
  }

  /**
   * `recv.name` bound to its receiver (C18): `bindMethod(recv, recv.name)`,
   * bound when rendered like a C# delegate; a receiver with effects is
   * evaluated once. Pending entries are re-based to the returned text.
   */
  private boundMethodGroup(rewritten: RewriteResult, baked: string): string {
    const group = rewritten.methodGroup!;
    this.needsBindMethod = true;
    if (group.simpleReceiver) {
      // The receiver is re-evaluated (unmapped); the handler keeps its tokens.
      const pre = `${BIND_METHOD}(${group.receiver}, `;
      this.pendingExprEntries = this.pendingExprEntries.map((e) => ({ ...e, outOffset: e.outOffset + pre.length }));
      return `${pre}${baked})`;
    }
    // A receiver with effects is evaluated once: ((r) => bind(r, r.name))(receiver).
    const r = "__tsazor_receiver";
    const pre = `((${r}) => ${BIND_METHOD}(${r}, ${r}.`;
    const name = baked.slice(group.nameOffset, group.nameEnd);
    const mid = `${name}))(`;
    this.pendingExprEntries = this.pendingExprEntries.flatMap((e) => {
      if (e.outOffset >= group.nameOffset && e.outOffset < group.nameEnd) {
        return [{ ...e, outOffset: pre.length + e.outOffset - group.nameOffset }];
      }
      if (e.outOffset >= group.receiverOffset && e.outOffset < group.receiverOffset + group.receiver.length) {
        return [{ ...e, outOffset: pre.length + mid.length + e.outOffset - group.receiverOffset }];
      }
      return [];
    });
    return `${pre}${mid}${group.receiver})`;
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
        const origin = isImplicit ? implicitStart : { line: node.pos.line, column: node.pos.column + 2 };
        // 3.3 MarkupString: `new MarkupString(inner)` and `inner as MarkupString`
        // (the analogue of C# `(MarkupString)s`) render unescaped — the inner
        // expression is baked straight into a Markup frame.
        const markup = this.markupStringContent(node.code, origin);
        if (markup !== null) {
          const baked = this.expr(markup.inner, markup.origin);
          const text = `${BUILDER}.addMarkupContent(${this.seq()}, ${baked});`;
          this.stmt(text, node.pos, text.indexOf(baked));
          break;
        }
        const baked = this.expr(node.code, origin);
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
            if (clause.paramName) this.locals.set(clause.paramName, "assignable");
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
          if (this.diagnosedTags.has(node) || this.componentLocalNames.get(node.tagName) === "__tsazor_unresolved") {
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
        const csharp = node.isForEach ? this.checkForEachHeader(node) : null;
        if (csharp) {
          // Recovery after TZS021: the C# header emitted as its TS form
          // (`var x in xs` ⇒ `const x of xs`), so locals and the LSP shadow stay intact.
          const iterableStart = node.codeStart === undefined ? undefined : advancePos(node.codeStart, node.code.slice(0, csharp.iterableOffset));
          const iterable = this.headerExpr(csharp.iterable, iterableStart);
          const text = `for (const ${csharp.binding} of ${iterable}) {`;
          this.stmt(text, node.pos, text.lastIndexOf(iterable));
          this.withScope(() => {
            for (const name of csharp.names) this.locals.set(name, "constLoop");
            for (const child of node.children) this.emitNode(child, node.pos);
          });
          this.stmt(`}`, node.pos);
          break;
        }
        // The header is TypeScript, emitted as written (`@foreach` is a
        // `for…of`/`for…in`): `let`/`const` bind per iteration — deferred
        // child content captures its own value — while `var` keeps its TS
        // meaning (one function-scoped binding, TZS022). The declared loop
        // variables are locals of the body; a `var` stays one after the loop.
        // A for…of/for…in variable is the iteration's element (C#: CS1656 —
        // a bind to it is an error); a counting `let i` is assignable.
        const iterates = forHeaderKind(node.code) !== "for";
        const isConst = /^\s*const\b/.test(node.code);
        const kind: LocalKind = iterates ? (isConst ? "constLoop" : "loop") : isConst ? "const" : "assignable";
        let declares: string[] = [];
        this.withScope(() => {
          const rewritten = this.rewrite(node.code, "forHeader");
          // An invalid @foreach header is TZS015 already (checkForEachHeader).
          if (!node.isForEach) this.reportSyntax("TZS015", rewritten, node.code, node.codeStart ?? node.pos);
          this.warnVar(rewritten, node.code, node.codeStart ?? node.pos);
          const header = this.headerLines(node.code, rewritten.text, node.codeStart);
          declares = rewritten.declares;
          for (const name of declares) this.locals.set(name, kind);
          const text = `for (${header}) {`;
          this.stmt(text, node.pos, text.indexOf(header));
          for (const child of node.children) this.emitNode(child, node.pos);
        });
        if (/^\s*var\b/.test(node.code)) for (const name of declares) this.locals.set(name, "assignable");
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
        this.diagnostics.error("TZS008", ref, "@ref requires a bare property name.");
        continue;
      }
      this.emitRefStmt(ref, node.pos, name);
    }
    this.emitNodes(node.children, node.pos);
    this.plumbingStmt(`${BUILDER}.closeElement();`);
  }

  /** `@ref="name"` → synthetic `this.name` member capture, token-anchored so
   *  hover/go-to-def on the ref name resolves the captured property. Typed
   *  shadows (2.4) cast to the element's interface — `HTMLElementTagNameMap[tag]`
   *  / `SVGElementTagNameMap[tag]`, unknown tags without a cast — so the usual
   *  `@ref` field type (`input`) typechecks (the TS2740 false positive). Real
   *  builds stay untyped (`el`); their output is byte-identical. */
  private emitRefStmt(ref: Extract<AttributeNode, { kind: "ref" }>, pos: SourcePos, elementName?: string): void {
    const seq = this.seq();
    const cast = elementName !== undefined && this.options.typedShadow !== undefined ? elementRefCastTag(elementName) : undefined;
    const value = `el${cast !== undefined ? ` as ${cast}` : ""}`;
    const text = `${BUILDER}.addElementReferenceCapture(${seq}, (el) => { this.${ref.code} = ${value}; });`;
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

  /* Typed shadows (2.4) ------------------------------------------------------ */

  /** The resolved type arguments of the tag: explicit `TItem="…"` attributes
   *  plus the inferred ones of the type layer, as substitution texts. The
   *  inference requests for still-unresolved parameters are collected here. */
  private tagTypeArguments(node: ElementNode, component: ComponentTarget, template: ReturnType<Codegen["templateAttributes"]>): ReadonlyMap<string, string> | undefined {
    if (this.options.typedShadow === undefined) return undefined;
    const metadata = component.metadata;
    if (!metadata || metadata.typeParameters.length === 0) return undefined;

    const args = new Map<string, string>();
    const resolveTypeText = (text: string): string | undefined => this.resolveTypeArgumentText(text);
    for (const [name, text] of template.typeArguments ?? []) {
      const resolved = resolveTypeText(text);
      if (resolved === undefined) return undefined;
      args.set(name, resolved);
    }
    const inferred = this.options.typedShadow!.typeArguments?.get(`${node.pos.line}:${node.pos.column}`);
    if (inferred) {
      for (const [name, text] of inferred) {
        const resolved = resolveTypeText(text);
        if (resolved === undefined) return undefined;
        args.set(name, resolved);
      }
    }

    // 2.4 inference: an unresolved type parameter anchors on the attribute
    // whose declared type uses it (`Items: TItem[]` ← `Items="this.people"`).
    for (const typeParameter of metadata.typeParameters) {
      if (args.has(typeParameter.name)) continue;
      const parameter = metadata.parameters.find((p) => p.category === "value" && !p.uncertain && (p.references ?? []).some((ref) => ref.kind === "typeParameter" && ref.name === typeParameter.name) && (p.type !== undefined || p.inferredType !== undefined));
      if (!parameter) continue;
      const attr = regularAttributeFor(parameter.name);
      const value = attr !== undefined ? this.expressionValue(attr) : null;
      if (attr === undefined || value === null || value.start === undefined) continue;
      this.inferenceRequests.push({
        tagId: `${node.pos.line}:${node.pos.column}`,
        tagName: node.tagName,
        typeParameter: typeParameter.name,
        parameterName: parameter.name,
        parameterType: parameter.type ?? parameter.inferredType!,
        value: value.start,
      });
    }

    return args;

    /** The tag's attribute setting this parameter (source order). */
    function regularAttributeFor(parameterName: string): ValueAttribute | undefined {
      return node.attributes.find((a): a is ValueAttribute =>
        (a.kind === "static" || a.kind === "expression" || a.kind === "mixedValue") && a.name.toLowerCase() === parameterName.toLowerCase());
    }
  }

  /**
   * A type-argument text as the consumer's module writes it: its root
   * identifiers resolve through the file's own perspective (`@import`s,
   * `@using` dirs, runtime types) so the shadow module can import them.
   */
  private resolveTypeArgumentText(text: string): string | undefined {
    // The type text uses the plain name (as written); `resolveType` collects
    // the module import each root identifier needs for the shadow module.
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
    let previous = ts.SyntaxKind.Unknown;
    for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
      if (token === ts.SyntaxKind.Identifier && previous !== ts.SyntaxKind.DotToken) {
        this.resolveType(scanner.getTokenText());
      }
      previous = token;
    }
    return text.trim().length === 0 ? undefined : text;
  }

  /**
   * The `satisfies`-type of the value the attribute sets (2.4): the
   * parameter's declared type, its type parameters replaced by the tag's
   * resolved arguments, undefined merged for optional parameters — or
   * undefined when the type cannot be expressed from this module (an import
   * the shadow cannot rebase, a local type of the declaring module). Side
   * effect: registers the parameter type's `import type` / runtime-alias
   * requirements.
   */
  private shadowParamType(parameter: ComponentParameter): string | undefined {
    if (this.options.typedShadow === undefined || parameter.uncertain || parameter.category === "captureUnmatchedValues") return undefined;
    const raw = parameter.type ?? parameter.inferredType;
    if (raw === undefined) return undefined;

    const substitution = new Map<string, { text: string }>();
    for (const ref of parameter.references ?? []) {
      switch (ref.kind) {
        case "typeParameter": {
          const arg = this.tagTypeArgs?.get(ref.name);
          if (arg === undefined) return undefined; // unresolved type argument: no check
          substitution.set(ref.name, { text: arg });
          break;
        }
        case "runtime": {
          // A runtime type: through the hygienic alias (shadow builds only,
          // so the extra alias never reaches a real build's import header).
          const runtimeName = ref.imported === undefined || ref.imported === "*" ? ref.name : ref.imported;
          this.runtimeAliases.add(runtimeName);
          substitution.set(ref.name, { text: alias(runtimeName) });
          break;
        }
        case "import": {
          if (this.importedNames.has(ref.name) || this.typeImports.has(ref.name)) break; // already bound in this module
          const specifier = this.options.typedShadow!.rebaseTypeImport?.(ref);
          if (specifier === undefined) return undefined;
          this.shadowTypeImports.set(ref.name, { specifier, imported: ref.imported });
          break;
        }
        case "local": {
          // Declared in the parameter's own module and not re-exported: not
          // expressible from this module — no check (no import to fake it).
          return undefined;
        }
        // "global": Math, Record, … — already in scope.
      }
    }
    let text = substitution.size > 0 ? replaceIdentifiers(raw, substitution) : raw;
    if (parameter.optional) text = `${text} | undefined`;
    return text;
  }

  /** The type of a RenderFragment<T> child content context (2.4): the
   *  parameter's `typeArgument`, resolved like a parameter type — the
   *  parameter's references bind its names, the tag's arguments substitute
   *  its type parameters. The runtime's untyped delegate placeholder
   *  (`unknown` — e.g. Virtualize's itemTemplate, which the runtime class
   *  cannot make generic yet) keeps `any`: a context of `unknown` would
   *  error every member use and tell the consumer nothing a `TItem` on the
   *  component could not. */
  private shadowContextType(parameter: ComponentParameter): string | undefined {
    const typeArgument = parameter.typeArgument;
    if (this.options.typedShadow === undefined || typeArgument === undefined) return undefined;
    if (typeArgument.trim() === "unknown") return undefined;
    return this.shadowParamType({
      ...parameter,
      optional: false,
      type: typeArgument,
      references: (parameter.references ?? []).filter((ref) => typeArgument.includes(ref.name)),
    });
  }

  /**
   * `@ref="name"` on a component (2.4): the capture receives the child's
   * instance (Blazor's ComponentReferenceCapture); the assignment casts to the
   * component type — with the tag's resolved type arguments, otherwise
   * `never` (the ref then accepts any field type; a generic reference without
   * arguments cannot be written as a type).
   */
  private emitComponentRefStmt(
    ref: Extract<AttributeNode, { kind: "ref" }>,
    pos: SourcePos,
    local: string,
    cast: "instance" | "never",
  ): void {
    const seq = this.seq();
    const referenceText = cast === "instance"
      ? `comp as ${local}${this.typeArgumentSuffix()}`
      : "comp as unknown as never";
    const text = `${BUILDER}.addComponentReferenceCapture(${seq}, (comp) => { this.${ref.code} = ${referenceText}; });`;
    if (ref.codeStart !== undefined) {
      this.pendingExprEntries.push({
        outOffset: text.indexOf(`this.${ref.code}`) + "this.".length,
        srcLine: ref.codeStart.line - 1,
        srcCol: ref.codeStart.column,
      });
    }
    this.stmt(text, pos);
  }

  /** `<>…` of the current tag's resolved type arguments, in the component's type-parameter order ("" without type parameters). */
  private typeArgumentSuffix(): string {
    const args = this.tagTypeArgs;
    const order = this.tagTypeArgsOrder ?? [];
    if (args === undefined || order.length === 0) return "";
    return `<${order.map((name) => args.get(name)!).filter((text) => text !== undefined).join(", ")}>`;
  }

  private emitComponent(node: ElementNode): void {
    const local = this.localForComponent(node.tagName, this.metadata.usings, tagNameRange(node))!;
    const key = node.attributes.find((a) => a.kind === "key");
    const refs = node.attributes.filter((a) => a.kind === "ref");
    const component = this.componentTargetFor(node.tagName);
    const template = this.templateAttributes(node, component);
    const regular = node.attributes.filter((a) => a.kind !== "key" && a.kind !== "ref" && !template.consumed.has(a));
    const slots = node.children.filter((child): child is ElementNode => child.kind === "element" && this.slotElements.has(child));
    // With explicit child content elements, whitespace between them is not content (Razor).
    const loose = slots.length > 0 ? node.children.filter((child) => !slots.includes(child as ElementNode) && !isWhitespaceText(child)) : node.children;

    // 2.4: the tag's type arguments (explicit `TItem="…"`, plus the inferred
    // ones from the type layer) drive the typed checks and slot contexts.
    const tagTypeArgs = this.tagTypeArguments(node, component, template);
    const previousTagArgs = this.tagTypeArgs;
    const previousOrder = this.tagTypeArgsOrder;
    this.tagTypeArgs = tagTypeArgs;
    this.tagTypeArgsOrder = component.metadata?.typeParameters.map((t) => t.name);

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
    for (const attr of regular) this.emitAttribute(attr, { tag: node.tagName, attributes: regular, isComponent: true, component });
    for (const ref of refs) {
      if (ref.kind !== "ref") continue;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(ref.code)) {
        this.diagnostics.error("TZS008", ref, "@ref on components requires a bare property name.");
        continue;
      }
      this.emitComponentRefStmt(
        ref,
        node.pos,
        local,
        (component.metadata?.typeParameters.length ?? 0) === 0 || (tagTypeArgs?.size ?? 0) === (component.metadata?.typeParameters.length ?? 0) ? "instance" : "never",
      );
    }
    const setByAttribute = (parameter: ComponentParameter): AttributeNode | undefined =>
      regular.find((a) => "name" in a && a.kind !== "eventHandler" && a.kind !== "eventModifier" && component.metadata && findParameter(component.metadata, a.name) === parameter);
    // Explicit child content elements (named slots), in source order.
    const emitted = new Set<ComponentParameter>();
    for (const slot of slots) {
      const parameter = this.slotElements.get(slot)!;
      if (emitted.has(parameter)) {
        this.diagnostics.error("TZS028", tagNameRange(slot), `The child content element '${slot.tagName}' of component '${node.tagName}' is used more than once — '${parameter.name}' can be set only once.`);
        continue;
      }
      emitted.add(parameter);
      this.checkSlotAttributes(slot, parameter);
      if (setByAttribute(parameter)) {
        // Razor RZ9995.
        this.diagnostics.error("TZS028", tagNameRange(slot), `The child content property '${parameter.name}' of '<${node.tagName}>' is set by both the attribute and the element contents.`);
        continue;
      }
      const contextName = parameter.category === "RenderFragment<T>" ? this.slotContextName(slot, template.context) : null;
      this.emitFragment(parameter.name, contextName, slot.children, slot, node.tagName, slot.tagName, parameter);
    }
    if (slots.length > 0 && loose.length > 0) {
      // Razor RZ9996: explicit child content elements and loose content do not mix.
      const first = loose[0]!;
      const accepted = slots.map((s) => `'${s.tagName}'`).filter((name, index, all) => all.indexOf(name) === index).join(", ");
      this.diagnostics.error("TZS027", { pos: first.pos, endPos: first.endPos }, `Unrecognized child content inside component '${node.tagName}'. With explicit child content elements (${accepted}), all content must be inside one — wrap the rest in '<ChildContent>…</ChildContent>'.`);
    } else if (loose.length > 0) {
      this.emitImplicitChildContent(node, component, loose, template.context, setByAttribute);
    }
    this.plumbingStmt(`${BUILDER}.closeComponent();`);
    this.tagTypeArgs = previousTagArgs;
    this.tagTypeArgsOrder = previousOrder;
  }

  /**
   * The element content of a component without explicit child content
   * elements: its `ChildContent`. A `RenderFragment<T>` ChildContent takes
   * the context (`Context="x"` on the component, default `context`); without
   * metadata — or for a plain RenderFragment — it is emitted as before
   * (`addContent` in the component frame).
   */
  private emitImplicitChildContent(
    node: ElementNode,
    component: ComponentTarget,
    children: MarkupNode[],
    context: string | undefined,
    setByAttribute: (parameter: ComponentParameter) => AttributeNode | undefined,
  ): void {
    const metadata = component.metadata;
    const parameter = metadata ? findParameter(metadata, "ChildContent") : undefined;
    // A misplaced child content element is reported already (classifyChildContent).
    const content = children.some((child) => !isWhitespaceText(child) && !(child.kind === "element" && this.diagnosedTags.has(child)));
    if (metadata && content) {
      if (parameter && setByAttribute(parameter)) {
        this.diagnostics.error("TZS028", tagNameRange(node), `The child content property '${parameter.name}' of '<${node.tagName}>' is set by both the attribute and the element contents.`);
        return;
      }
      if (!parameter && component.complete && !component.capture) {
        const fragments = metadata.parameters.filter(isFragment);
        this.diagnostics.error(
          "TZS025",
          tagNameRange(node),
          `Component '${node.tagName}' does not have a parameter 'ChildContent': it takes no element content${fragments.length > 0 ? ` — use its child content elements (${fragments.map((p) => `'${p.name}'`).join(", ")})` : ""}.`,
        );
        return;
      }
    }
    if (parameter?.category === "RenderFragment<T>") {
      this.emitFragment(parameter.name, context ?? "context", children, node, node.tagName, "ChildContent", parameter);
      return;
    }
    this.stmt(`${BUILDER}.addContent(${this.seq()}, (${BUILDER}) => {`, node.pos);
    this.enterScope();
    this.withScope(() => {
      for (const child of children) this.emitNode(child, node.pos);
    });
    this.leaveScope();
    this.stmt(`});`, node.pos);
  }

  /**
   * One child content parameter: a RenderFragment `(__builder) => { … }`, or
   * for RenderFragment<T> `(context) => (__builder) => { … }` with the
   * context as a local of the body. The body has its own sequence scope.
   * Typed shadows (2.4) type the context from the parameter's `typeArgument`
   * (substituted by the tag's type arguments); without one (or in a real
   * build) it stays `any`.
   */
  private emitFragment(name: string, context: string | null, children: MarkupNode[], at: ElementNode, component: string, element: string, parameter?: ComponentParameter): void {
    if (context !== null) {
      const enclosing = this.contextStack.find((c) => c.name === context);
      if (enclosing) {
        // Razor RZ9999 — an inner `context` would hide the outer one.
        this.diagnostics.error(
          "TZS029",
          tagNameRange(at),
          `The child content element '${element}' of component '${component}' uses the same parameter name ('${context}') as enclosing child content element '${enclosing.element}' of component '${enclosing.component}'. Specify the parameter name like: '<${element} Context="another_name">' to resolve the ambiguity.`,
        );
      }
    }
    const contextType = context !== null && parameter !== undefined ? this.shadowContextType(parameter) : undefined;
    const head = context === null
      ? `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(name)}, (${BUILDER}) => {`
      : `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(name)}, (${context}: ${contextType ?? "any"}) => (${BUILDER}: ${alias("RenderTreeBuilder")}) => {`;
    this.stmt(head, at.pos);
    this.enterScope();
    if (context !== null) this.contextStack.push({ name: context, element, component });
    this.withScope(() => {
      if (context !== null) this.locals.set(context, "context");
      for (const child of children) this.emitNode(child, at.pos);
    });
    if (context !== null) this.contextStack.pop();
    this.leaveScope();
    this.stmt(`});`, at.pos);
  }

  /**
   * Attributes of a component tag that are template syntax, not parameters
   * (never emitted): `Context="x"` — the context name of all its child
   * content (Razor: "Specifies the parameter name for all child content
   * expressions"), when the component has a RenderFragment<T> parameter and
   * no parameter named Context — and type arguments of a generic component
   * (`TItem="Person"`, one per `@typeparam`). A type argument has no runtime
   * meaning in TypeScript; typed shadows (2.4) consume it. The raw type-arg
   * texts travel with the template for the typed shadow layer.
   */
  private templateAttributes(node: ElementNode, component: ComponentTarget): {
    consumed: Set<AttributeNode>;
    context?: string;
    /** Raw type-argument texts of the tag (`TItem` → type text, as written). */
    typeArguments?: ReadonlyMap<string, string>;
  } {
    const consumed = new Set<AttributeNode>();
    const metadata = component.metadata;
    if (!metadata) return { consumed };
    let context: string | undefined;
    let typeArguments: Map<string, string> | undefined;
    const generic = metadata.parameters.some((p) => p.category === "RenderFragment<T>");
    for (const attr of node.attributes) {
      if (attr.kind !== "static" && attr.kind !== "expression" && attr.kind !== "mixedValue") continue;
      if (findParameter(metadata, attr.name)) continue;
      if (generic && attr.name.toLowerCase() === "context") {
        consumed.add(attr);
        context = this.contextAttributeValue(attr, `component '${node.tagName}'`);
        continue;
      }
      const typeParameter = metadata.typeParameters.find((t) => t.name === attr.name) ?? metadata.typeParameters.find((t) => t.name.toLowerCase() === attr.name.toLowerCase());
      if (typeParameter) {
        consumed.add(attr);
        const text = this.checkTypeArgument(attr, typeParameter.name, node.tagName);
        if (text !== undefined) {
          (typeArguments ??= new Map()).set(typeParameter.name, text);
        }
      }
    }
    return { consumed, ...(context !== undefined ? { context } : {}), ...(typeArguments ? { typeArguments } : {}) };
  }

  /** The context name of a RenderFragment<T> child content element: its own `Context`, else the component's, else `context`. */
  private slotContextName(slot: ElementNode, componentContext: string | undefined): string {
    let own: string | undefined;
    for (const attr of slot.attributes) {
      if ((attr.kind === "static" || attr.kind === "expression" || attr.kind === "mixedValue") && attr.name.toLowerCase() === "context") {
        own = this.contextAttributeValue(attr, `child content element '${slot.tagName}'`);
      }
    }
    return own ?? componentContext ?? "context";
  }

  /** Razor RZ9998 (child content element) / RZ10002 (component): the context name is literal text — here a TS identifier. */
  private contextAttributeValue(attr: ValueAttribute, owner: string): string | undefined {
    const value = attr.kind === "static" && !attr.minimized ? attr.value.trim() : undefined;
    if (value === undefined || !/^[A-Za-z_$][\w$]*$/.test(value)) {
      this.diagnostics.error("TZS028", attr, `Invalid parameter name. The parameter name attribute 'Context' on ${owner} can only include literal text — a TypeScript identifier ('Context="item"').`);
      return undefined;
    }
    return value;
  }

  /** A type argument attribute (`TItem="Person"`): the value must parse as a TS type; the raw text travels to the typed shadows. */
  private checkTypeArgument(attr: ValueAttribute, typeParameter: string, tag: string): string | undefined {
    const text = attr.kind === "static" ? (attr.minimized ? "" : attr.raw?.text ?? attr.value) : attr.kind === "expression" ? attr.code : "";
    const start = attr.kind === "static" ? attr.raw?.start : attr.kind === "expression" ? attr.codeStart : undefined;
    if (text.trim().length === 0 || attr.kind === "mixedValue") {
      this.diagnostics.error("TZS009", attr, `'${attr.name}' is the type argument '${typeParameter}' of '<${tag}>' and needs a type ('${attr.name}="Person"').`);
      return undefined;
    }
    const error = typeSyntaxError(text);
    if (error === null) return text;
    const at = start ? advancePos(start, text.slice(0, error.offset)) : attr.pos;
    this.diagnostics.error("TZS024", start ? textRange(at, text.slice(error.offset, error.offset + Math.max(error.length, 1))) : attr, `'${attr.name}' takes a TypeScript type: ${error.message}`);
    return undefined;
  }

  /**
   * Validates the attributes of a child content element (Razor RZ9997: only
   * `Context`, and only on a RenderFragment<T>). Called before emission.
   */
  private checkSlotAttributes(slot: ElementNode, parameter: ComponentParameter): void {
    for (const attr of slot.attributes) {
      const name = "name" in attr
        ? (attr.kind === "eventHandler" || attr.kind === "eventModifier" ? `@${attr.name}` : attr.name)
        : attr.kind === "bind" ? (attr.bindTarget !== undefined ? `@bind-${attr.bindTarget}` : "@bind") : `@${attr.kind}`;
      if ((attr.kind === "static" || attr.kind === "expression" || attr.kind === "mixedValue") && name.toLowerCase() === "context" && parameter.category === "RenderFragment<T>") continue;
      const hint = name.toLowerCase() === "context" ? ` — '${parameter.name}' is a RenderFragment without a context parameter` : "";
      this.diagnostics.error("TZS028", attr, `Unrecognized attribute '${name}' on child content element '${slot.tagName}'${hint}.`);
    }
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

  /**
   * Emits one attribute. `name` is the emitted name — on a component the
   * canonical parameter name (`Appearance` sets `appearance`).
   */
  private emitAttribute(attr: AttributeNode, ctx?: AttributeContext, name: string = "name" in attr ? attr.name : ""): void {
    const pos = attr.pos;
    // Token-precise origin of the attribute's value expression: the absolute
    // position of its code text.
    const codeStart = (): SourcePos | undefined => ("codeStart" in attr ? attr.codeStart : undefined);
    if (ctx?.component && (attr.kind === "static" || attr.kind === "expression" || attr.kind === "mixedValue")) {
      this.emitComponentAttribute(attr, ctx, ctx.component);
      return;
    }
    switch (attr.kind) {
      case "static": {
        // A minimized attribute is `true` (Razor) — the DOM applier then sets
        // the attribute, also where a same-named DOM property exists
        // (`disabled = ""` would be false).
        const raw = attr.minimized ? "true" : JSON.stringify(decodeHtmlEntities(attr.value));
        const value = ctx?.checkType !== undefined ? `(${raw}) satisfies ${ctx.checkType}` : raw;
        this.stmt(`${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(name)}, ${value});`, pos);
        break;
      }
      case "expression": {
        // Razor's method-group / lambda conversion, where the target
        // parameter's category is unknown: on a component tag, an on*-named
        // attribute value is taken as an event callback. Razor binds method
        // groups AND lambdas to the component instance via the
        // EventCallbackFactory; in TS a bare `this.handler` loses `this`, and
        // an arrow passed as a plain function would run without re-rendering
        // the owning page. So the compiler binds the value to `this` up
        // front: the handler runs on the authoring component and its
        // StateHasChanged fires. With metadata, EventCallback parameters get
        // the same binding by category (emitComponentAttribute).
        const value = ctx?.isComponent && ctx.category === undefined && EVENT_ATTR_PATTERN.test(attr.name)
          ? this.callbackValue(attr.code, codeStart())
          : this.expr(attr.code, codeStart());
        const checked = ctx?.checkType !== undefined ? `(${value}) satisfies ${ctx.checkType}` : value;
        const text = `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(name)}, ${checked});`;
        // Precise entries are relative to the value.
        this.stmt(text, pos, text.lastIndexOf(checked));
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
        const text = `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(name)}, \`${template}\`);`;
        this.stmt(text, pos);
        break;
      }
      case "eventHandler": {
        // On a component `@onclick` sets the parameter of that name (Blazor).
        const parameter = ctx?.component ? this.componentParameter(ctx.component, attr.name, attr, { line: pos.line, column: pos.column + 1 }) : undefined;
        const callback = this.callbackValue(attr.code, codeStart());
        const text = `${BUILDER}.addEventHandler(${this.seq()}, ${JSON.stringify(parameter?.name ?? attr.name)}, ${callback});`;
        this.stmt(text, pos, text.indexOf(callback));
        break;
      }
      case "eventModifier": {
        // Blazor's `__internal_preventDefault_onclick` attribute: a flag of the
        // element's listener, re-evaluated per render, also without a handler.
        // On a component it is a plain attribute, as in Blazor: a component
        // capturing unmatched values splats it onto its element.
        const value = attr.code === undefined ? "true" : this.expr(attr.code, codeStart());
        if (value.length === 0) {
          this.diagnostics.error("TZS009", attr, `'@${attr.name}:${attr.modifier}' requires a bool expression (or no value).`);
          break;
        }
        const internal = `__internal_${attr.modifier}_${attr.name}`;
        if (ctx?.component) {
          this.componentParameter(ctx.component, internal, attr, undefined, `'@${attr.name}:${attr.modifier}' on a component is an attribute it has to capture (captureUnmatchedValues)`);
        }
        const text = `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(internal)}, ${value});`;
        this.stmt(text, pos, text.lastIndexOf(value));
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

  /** Parameter metadata of the component a tag resolves to (2.2), looked up once per tag. */
  private componentTargetFor(tagName: string): ComponentTarget {
    const cached = this.componentTargets.get(tagName);
    if (cached) return cached;
    const resolve = this.options.resolveComponentMetadata;
    const metadata = resolve?.(tagName, this.metadata.usings, this.metadata.imports) ?? null;
    const target = componentTarget(tagName, metadata, resolve !== undefined);
    this.componentTargets.set(tagName, target);
    return target;
  }

  /**
   * Razor's component attribute lowering, by the target parameter's category
   * (2.2). `string`: as written (plain text is a string, `@expr` and mixed
   * text as on elements). Any other category: the value is a TypeScript
   * expression with or without `@` (`Count="5"` ⇒ `5`, `Items="people"` ⇒
   * `this.people`, `Interval="@4000"` ⇒ `4000`, a minimized attribute ⇒
   * `true`); for `EventCallback`/`EventCallback<T>` it becomes an
   * EventCallback bound to this component (method groups keep their
   * receiver, an EventCallback passes through). An unknown category (no
   * metadata, unmatched, `uncertain`) lowers the value as written.
   */
  private emitComponentAttribute(attr: ValueAttribute, ctx: AttributeContext, target: ComponentTarget): void {
    const parameter = this.componentParameter(target, attr.name, attr, attr.pos);
    const category = parameter && !parameter.uncertain ? parameter.category : undefined;
    const name = parameter?.name ?? attr.name;
    if (category === undefined || category === "string") {
      // 2.4: a string parameter's value — plain text, `@expr` or mixed — is
      // checked against the declared type in the shadow module.
      const checkType = category === "string" && parameter !== undefined ? this.shadowParamType(parameter) : undefined;
      this.emitAttribute(attr, { ...ctx, component: undefined, ...(category ? { category } : {}), ...(checkType !== undefined ? { checkType } : {}) }, name);
      return;
    }
    const source = this.expressionValue(attr);
    if (source === null) {
      this.diagnostics.error("TZS009", attr, `'${attr.name}' sets the ${category} parameter '${name}' of '<${target.tag}>': its value is a TypeScript expression, not empty text.`);
      return;
    }
    const isCallback = category === "EventCallback" || category === "EventCallback<T>";
    if (isCallback && source.code === "true" && source.start === undefined) {
      this.diagnostics.error("TZS009", attr, `'${attr.name}' sets the ${category} parameter '${name}' of '<${target.tag}>' and needs a handler value.`);
      return;
    }
    const value = isCallback
      ? this.callbackValue(source.code, source.start)
      : parameter!.delegate
        ? this.delegateValue(source.code, source.start)
        : this.expr(source.code, source.start);
    // 2.4: the shadow layer checks the value against the parameter's type.
    const checked = this.optionallyCheckedValue(value, target.metadata ? parameter! : undefined);
    const text = `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(name)}, ${checked});`;
    this.stmt(text, attr.pos, text.lastIndexOf(checked));
  }

  /**
   * The value with the typed shadow's `satisfies <type>` (2.4): the real
   * emission is byte-identical (the wrap exists only under
   * `options.typedShadow`); TS checks the value type through the shadow and
   * the diagnostic maps back to the attribute value. No check for callbacks,
   * delegating parameters and unresolved types.
   */
  private optionallyCheckedValue(value: string, parameter: ComponentParameter | undefined): string {
    if (parameter === undefined) return value;
    const category = parameter.category;
    if (category === "value" || category === "string") {
      const type = this.shadowParamType(parameter);
      if (type !== undefined) return `(${value}) satisfies ${type}`;
    }
    return value;
  }

  /**
   * An attribute value as a TS expression: the code of `@expr`/`@(expr)`, the
   * text as written otherwise — one leading `@` is Razor's optional
   * transition (`@4000`, `@a + 1`). A minimized attribute is `true`; null
   * for an empty value.
   */
  private expressionValue(attr: ValueAttribute): { code: string; start?: SourcePos } | null {
    if (attr.kind === "expression") return { code: attr.code, ...(attr.codeStart ? { start: attr.codeStart } : {}) };
    if (attr.kind === "static" && attr.minimized) return { code: "true" };
    const raw = attr.raw;
    if (raw === undefined || raw.text.trim().length === 0) return null;
    if (raw.text.startsWith("@") && !raw.text.startsWith("@@")) {
      return { code: raw.text.slice(1), start: { line: raw.start.line, column: raw.start.column + 1 } };
    }
    return { code: raw.text, start: raw.start };
  }

  /**
   * The parameter an attribute name sets (exact, else case-insensitive). An
   * attribute matching none on a target with complete metadata and no
   * capture parameter is TZS025 — the static counterpart of the runtime's
   * unknown-parameter error — with a "did you mean" fix renaming the name at
   * `namePos`; `unmatchedMessage` replaces the message (no suggestion). Where
   * metadata cannot decide (none, incomplete, an `uncertain` type) TZS026
   * warns and the value is lowered as written.
   */
  private componentParameter(target: ComponentTarget, name: string, range: SourceRange, namePos?: SourcePos, unmatchedMessage?: string): ComponentParameter | undefined {
    const metadata = target.metadata;
    if (!metadata) {
      this.warnUnavailable(target, range);
      return undefined;
    }
    const parameter = findParameter(metadata, name);
    if (parameter) {
      if (parameter.uncertain) {
        this.diagnostics.warning(
          "TZS026",
          range,
          `The type of parameter '${parameter.name}' of '<${target.tag}>' is unknown: ${uncertainReason(parameter)}. Its value is passed as written (plain text as a string); annotate the parameter with a type the compiler can follow.`,
        );
      }
      return parameter;
    }
    if (target.capture) return undefined;
    if (!target.complete) {
      this.warnUnavailable(target, range);
      return undefined;
    }
    if (unmatchedMessage !== undefined) {
      this.diagnostics.error("TZS025", range, `${unmatchedMessage}; '<${target.tag}>' has none.`);
      return undefined;
    }
    const suggestion = suggestParameter(metadata, name);
    const nameRange = namePos ? textRange(namePos, name) : undefined;
    const fix: DiagnosticFix | undefined = suggestion && nameRange ? { title: `Rename to '${suggestion}'`, edits: [{ ...nameRange, text: suggestion }] } : undefined;
    this.diagnostics.error(
      "TZS025",
      range,
      `Component '${target.tag}' does not have a parameter '${name}'.${suggestion ? ` Did you mean '${suggestion}'?` : ""}`,
      fix,
    );
    return undefined;
  }

  /** TZS026 once per tag: the component's parameters are unknown or incomplete. */
  private warnUnavailable(target: ComponentTarget, range: SourceRange): void {
    if (target.unavailable === undefined || this.unavailableWarned.has(target.tag)) return;
    this.unavailableWarned.add(target.tag);
    this.diagnostics.warning(
      "TZS026",
      range,
      `The parameters of '<${target.tag}>' are ${target.metadata ? "incomplete" : "unknown"}: ${target.unavailable}. Its attributes are passed as written (plain text as a string, On* values as EventCallbacks; no '<Target>Expression' for a component bind).`,
    );
  }

  /** Emits Blazor's @bind family: value + change handler, get/set/after, or
   *  Value + ValueChanged for component parameter targets. */
  private emitBind(attr: Extract<AttributeNode, { kind: "bind" }>, ctx: AttributeContext): void {
    const pos = attr.pos;
    // Component parameter binding: @bind or @bind-Target on a component tag
    // → Target + TargetChanged / Value + ValueChanged parameter pair. On an
    // element, `@bind-<attr>` binds that attribute (Razor: `@bind-value` is
    // `@bind` spelled out); an unresolved component tag keeps component form.
    const elementTag = ctx.tag !== "" && !/^[A-Z]/.test(ctx.tag) && !ctx.tag.includes(".");
    const isComponentBind = ctx.isComponent === true || (attr.bindTarget !== undefined && !elementTag);
    const label = attr.bindTarget !== undefined ? `@bind-${attr.bindTarget}` : "@bind";
    if (!this.checkBindShape(attr, label)) return;

    if (attr.format !== undefined) {
      const format = attr.modifierSpans?.format ?? attr;
      if (isComponentBind) {
        this.diagnostics.warning("TZS008", format, `'${label}:format' has no effect on a component (Blazor ignores it).`);
      }
      // For date/number inputs the format applies (3.7 — BindConverter subset);
      // only the other element binds keep the warning: their native round trip
      // carries no format, like .NET's string binds.
    }

    if (isComponentBind) {
      this.emitComponentBind(attr, attr.bindTarget ?? "Value", label, pos, ctx.component);
      return;
    }

    // Element binding: @bind / @bind-<attr> / :get + :set / :after / :event.
    const tag = ctx.tag.toLowerCase();
    const inputType = staticAttributeValue(ctx.attributes, "type")?.toLowerCase();
    const isCheckbox = tag === "input" && inputType === "checkbox";
    // `@bind` picks the attribute from the input type; `@bind-<attr>` names it
    // (HTML attribute names are case-insensitive: `@bind-Value` = `value`).
    const valueAttribute = attr.bindTarget !== undefined ? attr.bindTarget.toLowerCase() : isCheckbox ? "checked" : "value";
    // Number/date coercion applies to the value attribute (Razor's typed
    // `BindInputElement` entries cover `@bind` and `@bind-value` alike).
    const isNumber = tag === "input" && inputType === "number" && valueAttribute === "value";
    const isDate = tag === "input" && inputType === "date" && valueAttribute === "value";
    const event = attr.event ?? "onchange";
    // @bind:format on a number/date input formats the display value and parses
    // the change value (BindConverter subset, invariant culture, 3.7). Other
    // element binds keep the native round trip — a string carries no format,
    // like .NET's BindConverter — so the format warns as inert there.
    if (attr.format !== undefined && !isNumber && !isDate) {
      this.diagnostics.warning("TZS008", attr.modifierSpans?.format ?? attr, `'${label}:format' applies to date and number values only (Blazor: the BindConverter applies formats to the values that have one) — this bind keeps its native round trip.`);
    }
    const format = attr.format === undefined || (!isNumber && !isDate) ? undefined : attr.format.trim();
    // A plain-text format is a string literal (Razor: @bind:format="yyyy-MM-dd");
    // an @expression (e.g. @bind:format="@fmt") is the member reference.
    const formatEmit =
      format === undefined
        ? undefined
        : attr.formatLiteral === true
          ? JSON.stringify(format)
          : this.expr(attr.format!, undefined, attr.codeStarts?.format);

    // Value side: @bind or @bind:get.
    const display = this.expr(attr.get ?? attr.expression ?? "", undefined, attr.get !== undefined ? attr.codeStarts?.get : attr.codeStarts?.expression);
    if (display.length === 0) {
      this.diagnostics.error("TZS009", attr, `'${label}' requires an expression.`);
      return;
    }

    // A formatting bind: the display side renders through formatValue, the
    // change value parses with parseValue (both take the format expression —
    // it may be a variable — and keep the model's value when unparseable).
    if (format !== undefined) this.runtimeAliases.add("formatValue");
    if (format !== undefined) this.runtimeAliases.add("parseValue");

    // Extraction of the DOM value inside the change handler: Blazor's change
    // event value — `checked` for a checkbox, `value` otherwise, whatever
    // attribute is bound.
    let extract = "(__event.target as HTMLInputElement).value";
    if (isCheckbox) extract = "(__event.target as HTMLInputElement).checked";
    else if (isNumber) extract = format !== undefined ? "(__event.target as HTMLInputElement).value" : "Number((__event.target as HTMLInputElement).value)";
    else if (isDate) extract = format !== undefined ? "(__event.target as HTMLInputElement).value" : "new Date((__event.target as HTMLInputElement).value)";

    const parts: string[] = [];
    if (attr.set !== undefined) {
      // Blazor awaits an async setter (and :after) before re-rendering.
      if (format !== undefined && (isNumber || isDate)) {
        // A parse failure skips the setter (Blazor: TryParse false → no write).
        parts.push(
          `await ((__tsazor_parsed: unknown) => __tsazor_parsed !== null ? (${this.expr(attr.set, undefined, attr.codeStarts?.set)})(__tsazor_parsed as never) : undefined)(${FORMAT_PARSE}(${extract}, ${formatEmit}))`,
        );
      } else {
        parts.push(`await (${this.expr(attr.set, undefined, attr.codeStarts?.set)})(${extract})`);
      }
    } else {
      const assignmentTarget = this.bindAssignmentTarget(attr.expression ?? "", label, attr, attr.codeStarts?.expression !== undefined);
      if (assignmentTarget === null) return;
      if (format !== undefined && (isNumber || isDate)) {
        parts.push(`${assignmentTarget} = ${FORMAT_PARSE}(${extract}, ${formatEmit}) ?? ${assignmentTarget}`);
      } else if (isNumber) {
        parts.push(`${assignmentTarget} = Number.isNaN(Number((__event.target as HTMLInputElement).value)) ? ${assignmentTarget} : ${extract}`);
      } else {
        parts.push(`${assignmentTarget} = ${extract}`);
      }
    }
    if (attr.after !== undefined) parts.push(`await ${this.afterCall(attr.after, attr.codeStarts?.after)}`);
    const async = attr.set !== undefined || attr.after !== undefined ? "async " : "";

    this.stmt(
      `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(valueAttribute)}, ${format !== undefined ? `${FORMAT_VALUE}(${display}, ${formatEmit})` : display});`,
      pos,
    );
    this.stmt(
      `${BUILDER}.addEventHandler(${this.seq()}, ${JSON.stringify(event)}, ${this.eventCallback()}.bind(this, ${async}(__event) => { ${parts.join("; ")}; }));`,
      pos,
    );
  }

  /**
   * Blazor's (.NET 7) rules for combining a bind with its modifiers:
   * `:get` and `:set` come as a pair and replace the base bind (RZ10015,
   * RZ10016, RZ10018), `:after` cannot follow `:set` (RZ10019), and a
   * modifier needs a bind to modify (RZ10004). False = nothing to emit.
   */
  private checkBindShape(attr: Extract<AttributeNode, { kind: "bind" }>, label: string): boolean {
    const error = (message: string): false => {
      this.diagnostics.error("TZS008", attr, message);
      return false;
    };
    const base = attr.expression !== undefined;
    if (base && attr.get !== undefined) return error(`'${label}' can't be used together with '${label}:get'.`);
    if (attr.get !== undefined && attr.set === undefined) return error(`'${label}:get' must be used with '${label}:set'.`);
    if (attr.set !== undefined && attr.get === undefined) return error(`'${label}:set' was used but no '${label}:get' was found.`);
    if (attr.set !== undefined && attr.after !== undefined) {
      return error(`'${label}:after' can't be used with '${label}:set' — invoke the ':after' code inside ':set' instead.`);
    }
    if (!base && attr.get === undefined) {
      const modifier = (["event", "format", "after"] as const).find((k) => attr[k] !== undefined);
      // No modifier either: an invalid bind attribute the parser already reported.
      return modifier === undefined ? false : error(`'${label}:${modifier}' was used but no '${label}' was found.`);
    }
    return true;
  }

  /** The rewritten assignment target of a two-way bind; null (TZS008) when
   *  the expression cannot be assigned to (checked on the TS AST). */
  private bindAssignmentTarget(expression: string, label: string, range: SourceRange, located: boolean): string | null {
    const code = expression.trim();
    const target = checkBindTarget(code);
    if (!target.ok) {
      // Invalid TS is TZS024, reported where the value side was baked (when its start is known).
      if (!target.syntax || !located) this.diagnostics.error("TZS008", range, `'${label}' target '${code}' ${target.reason}.`);
      return null;
    }
    const readonly = target.identifier === undefined ? null : this.readonlyLocal(target.identifier);
    if (readonly !== null) {
      this.diagnostics.error("TZS008", range, `'${label}' cannot bind to ${readonly}.`);
      return null;
    }
    return this.expr(code);
  }

  /**
   * Why a bare name cannot be a bind target, or null: a read-only local (TS
   * TS2588/TS2630 — the handler would throw), an iteration variable (C#
   * CS1656 — the write only changes this iteration's copy and the next
   * render resets it) or an import (TS2632). Members win over imports.
   */
  private readonlyLocal(name: string): string | null {
    const loopHint = `— bind to a member like '${name}.name', or loop over indices and bind the element ('xs[i]')`;
    switch (this.locals.get(name)) {
      case "constLoop":
        return `the const loop variable '${name}' ${loopHint}`;
      case "loop":
        return `the loop variable '${name}': the write would only change this iteration's copy ${loopHint}`;
      case "const":
        return `the const local '${name}' — bind to a component member (or a member of '${name}')`;
      case "context":
        return `the template context '${name}': the write would only change this render's parameter — bind to a member like '${name}.name'`;
      case "function":
      case "class":
      case "enum":
        return `the ${this.locals.get(name)} declaration '${name}'`;
      case "assignable":
        return null;
    }
    if (!this.members.instance.has(name) && !this.members.statics.has(name) && this.importedNames.has(name)) {
      return `the import '${name}' (imports are read-only) — bind to a component member`;
    }
    return null;
  }

  /** Invocation of an `:after` value: a method group or a lambda. */
  private afterCall(after: string, start?: SourcePos): string {
    const baked = this.expr(after, undefined, start);
    return bareIdentifier(after.trim()) ? `${baked}()` : `(${baked})()`;
  }

  /**
   * Emits a component parameter bind: `<Target>` from the bound expression
   * (or `:get`) plus `<Target>Changed` — or the parameter `:event` names —
   * as an EventCallback that writes back (`:set`, or an assignment followed
   * by `:after`; async ones are awaited, Blazor's InvokeAsynchronousDelegate).
   */
  private emitComponentBind(
    attr: Extract<AttributeNode, { kind: "bind" }>,
    target: string,
    label: string,
    pos: SourcePos,
    component?: ComponentTarget,
  ): void {
    const display = this.expr(attr.get ?? attr.expression ?? "", undefined, attr.get !== undefined ? attr.codeStarts?.get : attr.codeStarts?.expression);
    if (display.length === 0) {
      this.diagnostics.error("TZS009", attr, `${label} requires an expression.`);
      return;
    }

    // On a component `:event` names the change callback parameter (Blazor).
    const changed = attr.event !== undefined ? attr.event.trim() : `${target}Changed`;
    if (!bareIdentifier(changed)) {
      this.diagnostics.error("TZS008", attr.modifierSpans?.event ?? attr, `'${label}:event' on a component names its change callback parameter (e.g. '${target}Changed'), got '${changed}'.`);
      return;
    }

    let handler: string;
    if (attr.set !== undefined) {
      handler = `async (__value) => { await (${this.expr(attr.set, undefined, attr.codeStarts?.set)})(__value); }`;
    } else {
      const assignmentTarget = this.bindAssignmentTarget(attr.expression ?? "", label, attr, attr.codeStarts?.expression !== undefined);
      if (assignmentTarget === null) return;
      handler = attr.after !== undefined
        ? `async (__value) => { ${assignmentTarget} = __value; await ${this.afterCall(attr.after, attr.codeStarts?.after)}; }`
        : `(__value) => { ${assignmentTarget} = __value; }`;
    }

    // Both parameters must exist (TZS025 otherwise); emitted under their
    // canonical names. The bind's name starts after `@bind-`.
    const targetParameter = component
      ? this.componentParameter(component, target, attr, attr.bindTarget !== undefined ? { line: pos.line, column: pos.column + "@bind-".length } : undefined)
      : undefined;
    const changedParameter = component ? this.componentParameter(component, changed, attr.modifierSpans?.event ?? attr) : undefined;
    this.stmt(`${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(targetParameter?.name ?? target)}, ${display});`, pos);
    // InputBase keys EditContext validation on a plain field-name string
    // (v1 contract): derive it from the bound member path — `this.model.name`
    // and `Model!.name` register under "name", matching the validators map's
    // field keys. Blazor emits ValueExpression for `:get` too — and only when
    // the component declares `<Target>Expression`; without metadata for the
    // target, `ValueExpression` is emitted as before (2.2).
    const expressionName = this.bindExpressionParameter(target, component);
    if (expressionName !== undefined) {
      const bound = checkBindTarget((attr.get ?? attr.expression ?? "").trim());
      if (bound.ok && bound.field) {
        this.stmt(`${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(expressionName)}, ${JSON.stringify(bound.field)});`, pos);
      }
    }
    this.stmt(
      `${BUILDER}.addAttribute(${this.seq()}, ${JSON.stringify(changedParameter?.name ?? changed)}, ${this.eventCallback()}.bind(this, ${handler}));`,
      pos,
    );
  }

  /**
   * The `<Target>Expression` parameter a component bind passes: its canonical
   * name when the target declares it (Razor emits it only then — an
   * undeclared one would be an unknown parameter at runtime). Not emitted
   * when the target's parameters are unknown.
   */
  private bindExpressionParameter(target: string, component: ComponentTarget | undefined): string | undefined {
    const metadata = component?.metadata;
    return metadata ? findParameter(metadata, `${target}Expression`)?.name : undefined;
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
   * Emits a switch with TS semantics: the sections share the case block (one
   * lexical scope, as in TS) and a section without a final jump falls
   * through to the next one — there is no implicit `break`. TZS023 warns
   * about that like TS's `noFallthroughCasesInSwitch`; stacked empty labels
   * (`case 1: case 2:`) and the last section are silent.
   */
  private emitSwitch(node: Extract<MarkupNode, { kind: "switch" }>): void {
    const header = this.headerExpr(node.code, node.codeStart);
    const text = `switch (${header}) {`;
    this.stmt(text, node.pos, text.indexOf(header));
    this.withScope(() => {
      node.cases.forEach((c, index) => {
        const label = c.code === null ? "default:" : `case ${this.expr(c.code, undefined, c.codeStart)}:`;
        this.stmt(label, c.span.pos);
        for (const child of c.children) this.emitNode(child, node.pos);
        if (c.children.length > 0 && index < node.cases.length - 1 && !endsWithJump(c.children)) {
          const written = c.code === null ? "default" : `case ${c.code}`;
          this.diagnostics.warning("TZS023", c.span, `'${written}:' falls through to the next case (TypeScript has no implicit break) — end it with 'break;'.`);
        }
      });
    });
    this.stmt(`}`, node.pos);
  }

  /** A statement run in a code context: verbatim TS (members baked), its
   *  declarations registered as locals for the rest of the enclosing scope. */
  private emitStatement(node: StatementNode): void {
    // Registered first: destructuring/function names inside the run itself
    // must stay bare too.
    for (const name of node.declares) this.locals.set(name, node.readonly?.[name] ?? "assignable");
    // Rewriting inserts `this.` prefixes, so its per-token entries keep the
    // columns after each prefix exact.
    const rewritten = this.rewrite(node.code, "statements", node.pos);
    const baked = rewritten.text;
    const tokens = this.pendingExprEntries;
    this.warnVar(rewritten, node.code, node.pos);
    this.pendingExprEntries = [];
    this.emitCodeVerbatim(baked, node.pos, 4, tokens);
  }

  /**
   * `@foreach` takes a TS `for…of`/`for…in` header (`const x of xs`,
   * `const [k, v] of pairs`, `const k in obj` — key iteration, as in TS),
   * emitted as written. A C# header (`var x in xs`, `string s in xs`,
   * `var (k, v) in pairs`) is TZS021 naming the exact TS rewrite; its TS
   * form is returned for recovery. Any other header is TZS015.
   */
  private checkForEachHeader(node: ForNode): CSharpForEach | null {
    // The whole `@foreach (…)` header; the fix replaces the code inside the parentheses.
    const range: SourceRange = { pos: node.pos, endPos: node.headerEnd ?? node.endPos };
    const csharp = csharpForEachHeader(node.code);
    if (csharp) {
      const header = `const ${csharp.binding} of ${csharp.iterable}`;
      const form = `@foreach (const ${csharp.binding} of ${csharp.iterable.replace(/\s+/g, " ")})`;
      const fix: DiagnosticFix | undefined = node.codeStart === undefined
        ? undefined
        : { title: `Use '${form}'`, edits: [{ ...textRange(node.codeStart, node.code), text: header }] };
      this.diagnostics.error("TZS021", range, `Use '${form}' — in TypeScript, for…in iterates keys.`, fix);
      return csharp;
    }
    const kind = forHeaderKind(node.code);
    if (kind === "for") {
      this.diagnostics.error("TZS015", range, "@foreach takes a for…of header ('const x of xs') — use @for for a counting loop.");
    } else if (kind === null) {
      this.diagnostics.error("TZS015", range, "Invalid @foreach header — expected '(const x of xs)'.");
    }
    return null;
  }

  /** TZS022 for each `var` declaration of render code; it keeps its TS meaning. Fix: `let`. */
  private warnVar(rewritten: RewriteResult, code: string, start: SourcePos): void {
    for (const offset of rewritten.varKeywords) {
      const keyword = textRange(advancePos(start, code.slice(0, offset)), "var");
      this.diagnostics.warning(
        "TZS022",
        keyword,
        "'var' is function-scoped in TypeScript: one binding for the whole render method, shared by every loop iteration and deferred child content.",
        { title: "Use 'let'", edits: [{ ...keyword, text: "let" }] },
      );
    }
  }

  /** Runs `emit` in a nested local scope: locals it declares vanish after. */
  private withScope(emit: () => void): void {
    const saved = [...this.locals];
    emit();
    this.locals.clear();
    for (const [name, kind] of saved) this.locals.set(name, kind);
  }

  /**
   * Bakes a control header (`if`/`for`/`while`/`switch` condition). Headers
   * stay at statement granularity (no token entries), but a multi-line header
   * anchors each continuation line at its first content — registered as
   * pending entries for the next stmt(), relative to the baked text.
   */
  private headerExpr(code: string, start: SourcePos | undefined): string {
    return this.headerLines(code, this.expr(code, undefined, start), start);
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

/**
 * Whether a switch section ends in a jump (`break`, `return`, `continue`,
 * `throw`) — also inside a trailing block, or in every branch of a trailing
 * if/else.
 */
function endsWithJump(children: MarkupNode[]): boolean {
  const last = children[children.length - 1];
  if (last?.kind === "block") return endsWithJump(last.children);
  if (last?.kind === "if") {
    return last.branches.some((b) => b.condition === null) && last.branches.every((b) => endsWithJump(b.children));
  }
  if (last?.kind !== "statement") return false;
  const code = last.code.replace(/\/\/[^\n]*$/gm, "").trim();
  const lastLine = code.split(/[;\n]\s*(?=\S)/).pop() ?? "";
  return /^(break|continue|return|throw)\b/.test(lastLine.trim());
}

/**
 * How a render-code local was declared: `assignable` (let/var, catch
 * parameter, counting-loop variable), `const`, an iteration variable of a
 * for…of/for…in (`constLoop`/`loop`), or a function/class/enum declaration.
 */
type LocalKind = "assignable" | "const" | "constLoop" | "loop" | "function" | "class" | "enum" | "context";

/** A RenderFragment / RenderFragment<T> parameter: settable by a child content element. */
function isFragment(parameter: ComponentParameter): boolean {
  return parameter.category === "RenderFragment" || parameter.category === "RenderFragment<T>";
}

/** Whitespace-only text (insignificant between child content elements). */
function isWhitespaceText(node: MarkupNode): boolean {
  return node.kind === "text" && node.content.trim().length === 0;
}

/** Renames an element: its start tag name and, when it has one on the same line, its end tag name. */
function elementNameEdits(node: ElementNode, name: string): TextEdit[] {
  const edits: TextEdit[] = [{ ...tagNameRange(node), text: name }];
  const close = `</${node.tagName}>`;
  if (!node.selfClosing && node.endPos.column >= close.length) {
    const pos = { line: node.endPos.line, column: node.endPos.column - close.length + 2 };
    edits.push({ pos, endPos: { line: pos.line, column: pos.column + node.tagName.length }, text: name });
  }
  return edits;
}

/** A C# `@foreach` header and its TS form (`binding` of `const <binding> of <iterable>`). */
interface CSharpForEach {
  names: string[];
  binding: string;
  iterable: string;
  /** Offset of the iterable within the header code. */
  iterableOffset: number;
}

/**
 * C# @foreach headers: `var x in xs`, `string s in xs` (typed C# variable)
 * and deconstruction `var (k, v) in pairs` / `(string k, int v) in pairs`.
 * TS headers (`const k in obj`, `let x of xs`) are not C#.
 */
function csharpForEachHeader(code: string): CSharpForEach | null {
  const tuple = /^\s*(?:var\s*)?\(\s*([^)]*)\)\s+in\s+/.exec(code);
  if (tuple) {
    // `(k, v)` or typed `(string k, int v)` → the names.
    const names = tuple[1]!.split(",").map((part) => part.trim().split(/\s+/).pop() ?? "");
    if (names.length === 0 || !names.every((n) => /^[A-Za-z_$][\w$]*$/.test(n))) return null;
    return { names, binding: `[${names.join(", ")}]`, iterable: code.slice(tuple[0].length).trim(), iterableOffset: tuple[0].length };
  }
  const single = /^\s*(?:var\s+|(?!(?:let|const|var)\b)[A-Za-z_$][\w$.]*(?:<[^()]*>)?(?:\[\])*\??\s+)([A-Za-z_$][\w$]*)\s+in\s+/.exec(code);
  if (!single) return null;
  const iterable = code.slice(single[0].length);
  if (iterable.trim().length === 0) return null;
  return { names: [single[1]!], binding: single[1]!, iterable: iterable.trim(), iterableOffset: single[0].length };
}

/* Diagnostic ranges ------------------------------------------------------- */

/* Typed shadows (2.4): the `@ref` cast's type text for an element tag —
 * `HTMLElementTagNameMap[tag]` / `SVGElementTagNameMap[tag]` for known tags
 * (the lib.dom index gives the tag's precise interface), undefined for
 * unknown/custom elements (the capture keeps `el`: plain `Element`). */
const HTML_REF_TAGS = new Set("a abbr address area article aside audio b base bdi bdo blockquote body br button canvas caption cite code col colgroup data datalist dd del details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 h4 h5 h6 header hgroup hr i iframe img input ins kbd label legend li link main map mark menu meter nav noscript object ol optgroup option output p picture pre progress q rp rt ruby s samp script search section select slot small source span strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track u ul var video wbr".split(" "));
const SVG_REF_TAGS = new Set("svg circle ellipse g line path polygon polyline rect text tspan defs use symbol marker clipPath mask pattern foreignObject linearGradient radialGradient stop image filter title desc".split(" "));

function elementRefCastTag(tagName: string): string | undefined {
  if (HTML_REF_TAGS.has(tagName)) return `HTMLElementTagNameMap["${tagName}"]`;
  if (SVG_REF_TAGS.has(tagName)) return `SVGElementTagNameMap["${tagName}"]`;
  return undefined;
}

/** A directive without its trailing whitespace: `@name value`. */
function directiveRange(d: DirectiveNode): SourceRange {
  if (d.value.length > 0 && d.valueStart) return { pos: d.pos, endPos: advancePos(d.valueStart, d.value) };
  return { pos: d.pos, endPos: { line: d.pos.line, column: d.pos.column + 1 + d.name.length } };
}

/** A directive's value (the whole directive when it has none). */
function directiveValueRange(d: DirectiveNode): SourceRange {
  if (d.value.length > 0 && d.valueStart) return { pos: d.valueStart, endPos: advancePos(d.valueStart, d.value) };
  return directiveRange(d);
}

/** The name of an element's start tag (`Foo` of `<Foo …>`). */
function tagNameRange(node: { pos: SourcePos; tagName: string }): SourceRange {
  const pos = { line: node.pos.line, column: node.pos.column + 1 };
  return { pos, endPos: { line: pos.line, column: pos.column + node.tagName.length } };
}

/** `text` placed at `start`, as a range. */
function textRange(start: SourcePos, text: string): SourceRange {
  return { pos: start, endPos: advancePos(start, text) };
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