/**
 * The API part of the reference (Node, build time): the public exports of
 * @tsazor/runtime, testing, dotnet and vite-plugin, read from each package's
 * built declarations (`dist/index.d.ts`, comments kept) with the TypeScript
 * checker — the same surface the API snapshot (`api/*.api.d.ts`) guards,
 * here with the doc comments.
 *
 * Per export: kind, signature (printed without comments, highlighted), the
 * JSDoc with its tags, and for classes and interfaces their members. Private
 * members, `#names` and anything tagged `@internal` are left out; re-exports
 * from another package are skipped; a component class links to its
 * component page instead of repeating its parameters.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { highlight } from "./highlight.js";
import type { ApiKind, ApiMember, ApiPackage, ApiSymbol } from "../src/reference-types.js";

const PACKAGES: ReadonlyArray<{ slug: string; dir: string; description: string }> = [
  { slug: "runtime", dir: "runtime", description: "Components, rendering, routing and navigation, forms and validation, DI, auth, HTTP, localization." },
  { slug: "testing", dir: "testing", description: "bUnit-style component tests: render, find, click, change, settle." },
  { slug: "worker", dir: "worker", description: "Heavy work off the main thread: typed calls into Web Workers, callbacks, cancellation, pools, a test double." },
  { slug: "dotnet", dir: "dotnet", description: "Typed clients for ASP.NET Core backends: ProblemDetails, results, generated contracts." },
  { slug: "vite-plugin", dir: "vite-plugin", description: "The Vite plugin: compiles .tsazor files, routes, scoped CSS, the dev-time type check." },
];

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

type Markdown = (markdown: string) => string;

const KNOWN_TAGS = new Set(["param", "returns", "return", "example", "see", "deprecated", "internal", "throws", "remarks", "typeParam", "template", "default", "defaultValue"]);

interface DocParts {
  markdown: string;
  deprecated?: string;
  internal: boolean;
}

/** The JSDoc of a declaration as Markdown: the text, then its tags (params, returns, examples …). */
function docOf(node: ts.Node): DocParts {
  const docs = ts.getJSDocCommentsAndTags(node).filter(ts.isJSDoc);
  const doc = docs[docs.length - 1];
  if (!doc) return { markdown: "", internal: false };
  const text: string[] = [ts.getTextOfJSDocComment(doc.comment) ?? ""];
  const params: string[] = [];
  const extra: string[] = [];
  let deprecated: string | undefined;
  let internal = false;
  for (const tag of doc.tags ?? []) {
    const name = tag.tagName.text;
    const comment = (ts.getTextOfJSDocComment(tag.comment) ?? "").trim();
    if (!KNOWN_TAGS.has(name)) {
      // Prose that happens to start a line with `@` (`@bind-Value emits …`): keep it as text.
      text.push(`@${name}${comment ? ` ${comment}` : ""}`);
      continue;
    }
    if (name === "internal") internal = true;
    else if (name === "deprecated") deprecated = comment || "Deprecated.";
    else if ((name === "param" || name === "typeParam" || name === "template") && (ts.isJSDocParameterTag(tag) || ts.isJSDocTemplateTag(tag))) {
      const paramName = ts.isJSDocParameterTag(tag) ? tag.name.getText() : tag.typeParameters.map((p) => p.name.text).join(", ");
      params.push(`- \`${paramName}\`${comment ? ` — ${comment.replace(/^-\s*/, "")}` : ""}`);
    } else if (name === "returns" || name === "return") extra.push(`**Returns** ${comment}`);
    else if (name === "throws") extra.push(`**Throws** ${comment}`);
    else if (name === "example") extra.push(comment.includes("```") ? comment : `\`\`\`ts\n${comment}\n\`\`\``);
    else if (name === "see") extra.push(`**See** ${comment}`);
    else if (name === "remarks") text.push(comment);
    else if (name === "default" || name === "defaultValue") extra.push(`**Default** \`${comment}\``);
  }
  const parts = [text.join("\n").trim()];
  if (params.length > 0) parts.push(`**Parameters**\n\n${params.join("\n")}`);
  parts.push(...extra);
  const result: DocParts = { markdown: parts.filter(Boolean).join("\n\n"), internal };
  if (deprecated) result.deprecated = deprecated;
  return result;
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind);

/** Printed without comments and without `export`/`declare`/`default`. */
function print(node: ts.Node, file: ts.SourceFile): string {
  return printer
    .printNode(ts.EmitHint.Unspecified, node, file)
    .replace(/^(export\s+)?(default\s+)?(declare\s+)?/, "")
    .trim();
}

/** `class X<T> extends Y implements Z` — the header without the body. */
function headerOf(node: ts.ClassDeclaration | ts.InterfaceDeclaration, file: ts.SourceFile): string {
  const printed = print(node, file);
  const brace = printed.indexOf("{");
  return (brace < 0 ? printed : printed.slice(0, brace)).trim();
}

function memberKind(member: ts.Node): ApiMember["kind"] | undefined {
  if (ts.isConstructorDeclaration(member)) return "constructor";
  if (ts.isMethodDeclaration(member) || ts.isMethodSignature(member)) return "method";
  if (ts.isPropertyDeclaration(member) || ts.isPropertySignature(member)) return "property";
  if (ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) return "accessor";
  if (ts.isIndexSignatureDeclaration(member)) return "index";
  if (ts.isCallSignatureDeclaration(member) || ts.isConstructSignatureDeclaration(member)) return "call";
  return undefined;
}

function membersOf(node: ts.ClassDeclaration | ts.InterfaceDeclaration, file: ts.SourceFile, markdown: Markdown, checker: ts.TypeChecker): ApiMember[] {
  const members: ApiMember[] = [];
  const byName = new Map<string, ApiMember>();
  for (const member of node.members) {
    const kind = memberKind(member);
    if (!kind) continue;
    if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) continue;
    if (member.name && ts.isPrivateIdentifier(member.name)) continue;
    const doc = docOf(member);
    if (!doc.markdown && member.name) {
      // An override without its own comment: the base member's doc, as the editor shows it.
      const inherited = checker.getSymbolAtLocation(member.name)?.getDocumentationComment(checker);
      if (inherited && inherited.length > 0) doc.markdown = ts.displayPartsToString(inherited);
    }
    if (doc.internal) continue;
    const name = kind === "constructor" ? "constructor" : member.name ? member.name.getText(file) : kind === "index" ? "[index]" : "()";
    const signature = print(member, file);
    // Overloads and get/set pairs: one entry, every signature.
    const existing = byName.get(`${kind}:${name}`);
    if (existing) {
      existing.signature += `\n${highlight(signature, "ts")}`;
      if (!existing.doc && doc.markdown) existing.doc = markdown(doc.markdown);
      continue;
    }
    const entry: ApiMember = { name, kind, signature: highlight(signature, "ts"), doc: doc.markdown ? markdown(doc.markdown) : "" };
    if (hasModifier(member, ts.SyntaxKind.StaticKeyword)) entry.static = true;
    if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) entry.protected = true;
    if (doc.deprecated) entry.deprecated = markdown(doc.deprecated);
    byName.set(`${kind}:${name}`, entry);
    members.push(entry);
  }
  return members;
}

function kindOf(declaration: ts.Declaration): ApiKind | undefined {
  if (ts.isClassDeclaration(declaration)) return "class";
  if (ts.isInterfaceDeclaration(declaration)) return "interface";
  if (ts.isTypeAliasDeclaration(declaration)) return "type";
  if (ts.isFunctionDeclaration(declaration)) return "function";
  if (ts.isVariableDeclaration(declaration)) return "const";
  if (ts.isEnumDeclaration(declaration)) return "enum";
  if (ts.isModuleDeclaration(declaration)) return "namespace";
  return undefined;
}

/** The package a file belongs to (its nearest package.json's name). */
function packageOf(file: string): string | undefined {
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) return (JSON.parse(readFileSync(manifest, "utf8")) as { name: string }).name;
  }
  return undefined;
}

function firstSentence(markdownText: string): string {
  const flat = markdownText.split(/\n\s*\n/)[0]!.replace(/\s+/g, " ").trim();
  return /^[\s\S]*?[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat;
}

export interface ApiOptions {
  markdown: Markdown;
  inline: Markdown;
  /** A component class of the package → its component page. */
  componentHref: (packageSlug: string, name: string) => string | undefined;
}

export function loadApi(repoRoot: string, options: ApiOptions): ApiPackage[] {
  return PACKAGES.map(({ slug, dir, description }) => {
    const packageDir = path.join(repoRoot, "packages", dir);
    const name = (JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8")) as { name: string }).name;
    const entry = path.join(packageDir, "dist", "index.d.ts");
    if (!existsSync(entry)) throw new Error(`${entry} is missing — build the packages first (pnpm -r build).`);
    const program = ts.createProgram([entry], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
    const checker = program.getTypeChecker();
    const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(entry)!);
    const exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol) : [];
    const symbols: ApiSymbol[] = [];
    for (const exported of exports) {
      const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const declarations = (target.getDeclarations() ?? []).filter((declaration) => kindOf(declaration) !== undefined);
      const first = declarations[0];
      if (!first) continue;
      const file = first.getSourceFile();
      if (packageOf(file.fileName) !== name) continue;
      const kind = kindOf(first)!;
      const docNode = ts.isVariableDeclaration(first) ? first.parent.parent : first;
      const doc = docOf(docNode);
      if (doc.internal) continue;
      const exportName = exported.getName();
      const signatures = declarations.map((declaration) => {
        if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) return headerOf(declaration, file);
        if (ts.isVariableDeclaration(declaration)) return `const ${print(declaration, declaration.getSourceFile())}`;
        return print(declaration, declaration.getSourceFile());
      });
      const symbol: ApiSymbol = {
        name: exportName,
        kind,
        packageSlug: slug,
        signature: highlight([...new Set(signatures)].join("\n"), "ts"),
        doc: doc.markdown ? options.markdown(doc.markdown) : "",
        summary: doc.markdown ? options.inline(firstSentence(doc.markdown)) : "",
        members: ts.isClassDeclaration(first) || ts.isInterfaceDeclaration(first) ? membersOf(first, file, options.markdown, checker) : [],
      };
      if (doc.deprecated) symbol.deprecated = options.markdown(doc.deprecated);
      const component = kind === "class" ? options.componentHref(slug, exportName) : undefined;
      if (component) symbol.component = component;
      symbols.push(symbol);
    }
    symbols.sort((a, b) => a.name.localeCompare(b.name, "en"));
    return { slug, name, description, symbols };
  });
}
