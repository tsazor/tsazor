#!/usr/bin/env node
/**
 * S1 — the API contract: a snapshot of every published package's public
 * TypeScript surface, checked in CI.
 *
 *   node scripts/api-snapshot.mjs           writes api/<package>.api.d.ts
 *   node scripts/api-snapshot.mjs --check   compares, exit 1 on a difference
 *
 * The surface is what the package's `exports` entries export (their .d.ts,
 * after `pnpm -r build`): every exported symbol with its declaration, comments
 * removed, so a doc-only change is no API change. A symbol that comes from
 * another package (a re-export, such as @tsazor/testing's runtime) is one
 * line naming its origin. A change to the surface fails the check until the
 * snapshot is updated on purpose — with a changelog entry.
 *
 * Internal entries (docs/support-policy.md, D-S7) go to api/<package>.internal.api.d.ts: a
 * package's `"tsazor": { "internal": true }` makes all of it internal (compiler, workspace, lsp),
 * a list of subpaths only those (`["./internal"]` in @tsazor/runtime). They are snapshotted too,
 * so a change stays visible, but they are outside the stability promise: no changelog entry.
 *
 * An own export that takes the name of one its `export * from` re-exports (the local one wins silently) fails too.
 * So does a difference between the skins' components (their manifests: components, parameters, types, defaults) that
 * api/skin-parity.json doesn't list with a reason, and a listed one that is gone.
 * A public declaration that names a type of its own package which no public entry exports fails the
 * check too (API Extractor's "forgotten export"): apps couldn't name the type, and a change to it
 * would pass unseen. Export the type, or keep the declaration out of the public entries.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "api");
const check = process.argv.includes("--check");

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

/**
 * The `@deprecated` and `@internal` tags of a declaration and its members, one line each
 * (`// @deprecated Foo.bar: use baz`): a deprecation or an internal member that reaches the declarations is an API
 * fact the printed signature doesn't show (the printer drops comments, so a doc edit doesn't change the snapshot).
 */
function tagLines(node, path = []) {
  const name = node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) || ts.isPrivateIdentifier(node.name)) ? node.name.text : undefined;
  const here = name === undefined ? path : [...path, name];
  const lines = ts
    .getJSDocTags(node)
    .filter((tag) => tag.tagName.text === "deprecated" || tag.tagName.text === "internal")
    .map((tag) => {
      const comment = typeof tag.comment === "string" ? tag.comment : ts.getTextOfJSDocComment(tag.comment) ?? "";
      return `// @${tag.tagName.text} ${here.join(".")}${comment.trim() ? `: ${comment.trim().split("\n")[0]}` : ""}`;
    });
  const members = ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) ? node.members : ts.isVariableStatement(node) ? node.declarationList.declarations : [];
  for (const member of members) lines.push(...tagLines(member, here));
  return lines;
}

/** The printable statement of a declaration (a variable's whole statement). */
function statementOf(declaration) {
  if (ts.isVariableDeclaration(declaration)) return declaration.parent.parent;
  return declaration;
}

/** The package a file belongs to (its nearest package.json's name). */
function packageOf(file) {
  for (let dir = path.dirname(file); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) return JSON.parse(readFileSync(manifest, "utf8")).name;
  }
  return undefined;
}

function surfaceOf(packageName, entryFile) {
  const program = ts.createProgram([entryFile], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  // What the entry declares for modules it doesn't own (`/client`: `declare module "virtual:tsazor-routes"`).
  const ambient = (source?.statements ?? [])
    .filter((statement) => ts.isModuleDeclaration(statement) && ts.isStringLiteral(statement.name))
    .map((statement) => `// declare module "${statement.name.text}"\n${printer.printNode(ts.EmitHint.Unspecified, statement, source)}`);
  if (!moduleSymbol) return ambient.length > 0 ? `${ambient.join("\n\n")}\n` : "// (no exports)\n";
  const exports = checker.getExportsOfModule(moduleSymbol).sort((a, b) => a.getName().localeCompare(b.getName()));
  const blocks = [];
  for (const exported of exports) {
    const name = exported.getName();
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const declarations = target.getDeclarations() ?? [];
    const origin = declarations[0] ? packageOf(declarations[0].getSourceFile().fileName) : undefined;
    if (origin && origin !== packageName) {
      blocks.push(`// ${name}: re-exported from ${origin}`);
      continue;
    }
    const printed = [...new Set(declarations.map((declaration) => {
      const statement = statementOf(declaration);
      return [printer.printNode(ts.EmitHint.Unspecified, statement, statement.getSourceFile()), ...tagLines(statement)].join("\n");
    }))];
    blocks.push([`// ${name}`, ...printed].join("\n"));
  }
  return `${blocks.join("\n\n")}\n`;
}

/**
 * The names an entry's own exports take from an `export * from "…"` of it: the local export wins silently, so a name
 * of @tsazor/testing's would hide the runtime's. `[name, star module]` for each.
 */
function shadowedStarExports(entryFile) {
  const program = ts.createProgram([entryFile], { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entryFile);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return [];
  const resolve = (symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const own = checker.getExportsOfModule(moduleSymbol);
  const shadowed = [];
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.exportClause || !statement.moduleSpecifier) continue;
    const star = checker.getSymbolAtLocation(statement.moduleSpecifier);
    if (!star) continue;
    const starred = new Map(checker.getExportsOfModule(star).map((symbol) => [symbol.getName(), symbol]));
    for (const exported of own) {
      const theirs = starred.get(exported.getName());
      if (theirs && resolve(theirs) !== resolve(exported)) shadowed.push([exported.getName(), statement.moduleSpecifier.text]);
    }
  }
  return shadowed;
}

/**
 * The skins' differences that api/skin-parity.json doesn't explain: a component, a parameter (not settable from markup:
 * cascading members aside) or a type only one skin has, a default that differs — each would make a skin switch more than
 * one line, or fall through silently as an HTML attribute on a component that captures unmatched ones. And the listed
 * differences that are gone, so the list stays true.
 */
function skinParity() {
  const skins = ["@tsazor/bootstrap", "@tsazor/fluent"];
  const manifests = skins.map((name) => {
    const file = path.join(root, "packages", name.replace("@tsazor/", ""), "dist", "tsazor-components.json");
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).components : undefined;
  });
  if (manifests.some((manifest) => manifest === undefined)) return [];
  const allowed = JSON.parse(readFileSync(path.join(apiDir, "skin-parity.json"), "utf8"));
  const used = new Set();
  const problems = [];
  const check = (section, key, problem) => {
    if (allowed[section]?.[key] !== undefined) used.add(`${section}:${key}`);
    else problems.push(`${problem} (or list it in api/skin-parity.json with the reason)`);
  };
  const parameters = (component) => new Map(component.parameters.filter((parameter) => !parameter.cascading).map((parameter) => [parameter.name, parameter]));
  for (const [index, name] of skins.entries()) {
    const own = manifests[index];
    const other = manifests[1 - index];
    for (const component of Object.keys(own)) {
      if (!(component in other)) check("components", `${name}:${component}`, `${component} is only in ${name}`);
    }
    for (const component of Object.keys(own).filter((component) => component in other)) {
      const theirs = parameters(other[component]);
      for (const [parameter] of parameters(own[component])) {
        if (!theirs.has(parameter)) check("parameters", `${name}:${component}.${parameter}`, `${component}.${parameter} is only in ${name}`);
      }
    }
  }
  for (const component of Object.keys(manifests[0]).filter((component) => component in manifests[1])) {
    const fluent = parameters(manifests[1][component]);
    for (const [parameter, bootstrap] of parameters(manifests[0][component])) {
      const other = fluent.get(parameter);
      if (!other) continue;
      const typeOf = (p) => p.type ?? p.inferredType ?? "unknown";
      if (typeOf(bootstrap) !== typeOf(other)) {
        problems.push(`${component}.${parameter} is ${typeOf(bootstrap)} in @tsazor/bootstrap, ${typeOf(other)} in @tsazor/fluent`);
      }
      if (bootstrap.default !== other.default) {
        check("defaults", `${component}.${parameter}`, `${component}.${parameter} defaults to ${bootstrap.default} in @tsazor/bootstrap, ${other.default} in @tsazor/fluent`);
      }
    }
  }
  for (const section of ["components", "parameters", "defaults"]) {
    for (const key of Object.keys(allowed[section] ?? {})) {
      if (!used.has(`${section}:${key}`)) problems.push(`api/skin-parity.json lists ${key} (${section}), but the skins agree there now: remove it`);
    }
  }
  return problems;
}

function packages() {
  const dir = path.join(root, "packages");
  return readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((pkg) => existsSync(path.join(pkg, "package.json")))
    .map((pkg) => ({ dir: pkg, manifest: JSON.parse(readFileSync(path.join(pkg, "package.json"), "utf8")) }))
    // A generated package (`"tsazor": { "apiSnapshot": false }`: @tsazor/fluent-icons, 20,000 icons) is its source set, pinned by version.
    .filter(({ manifest }) => !manifest.private && manifest.name.startsWith("@tsazor/") && manifest.exports && manifest.tsazor?.apiSnapshot !== false);
}

/**
 * The types a package's public declarations name without exporting them: `{ symbol name → [the declarations naming
 * it] }`. `entries` are the public entries' .d.ts files.
 */
function forgottenExports(packageName, entries) {
  if (entries.length === 0) return new Map();
  const program = ts.createProgram(entries, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, skipLibCheck: true });
  const checker = program.getTypeChecker();
  const resolve = (symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const exported = new Set();
  const roots = [];
  for (const entry of entries) {
    const source = program.getSourceFile(entry);
    const moduleSymbol = source && checker.getSymbolAtLocation(source);
    if (!moduleSymbol) continue;
    for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
      const target = resolve(symbol);
      exported.add(target);
      roots.push([symbol.getName(), target]);
    }
  }
  const forgotten = new Map();
  const visit = (node, owner) => {
    let name;
    if (ts.isTypeReferenceNode(node)) name = node.typeName;
    else if (ts.isExpressionWithTypeArguments(node)) name = node.expression;
    else if (ts.isTypeQueryNode(node)) name = node.exprName;
    if (name) {
      const symbol = checker.getSymbolAtLocation(ts.isQualifiedName(name) ? name.left : name) ?? checker.getSymbolAtLocation(name);
      const target = symbol && resolve(symbol);
      const declaration = target?.getDeclarations()?.[0];
      // Type parameters, and what comes from TypeScript's lib or another package, are fine.
      if (declaration && !ts.isTypeParameterDeclaration(declaration) && !exported.has(target) && packageOf(declaration.getSourceFile().fileName) === packageName && !declaration.getSourceFile().hasNoDefaultLib) {
        const list = forgotten.get(target.getName()) ?? new Set();
        list.add(owner);
        forgotten.set(target.getName(), list);
      }
    }
    // Private members aren't API.
    if (ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.PrivateKeyword)) return;
    ts.forEachChild(node, (child) => visit(child, owner));
  };
  for (const [name, target] of roots) for (const declaration of target.getDeclarations() ?? []) visit(declaration, name);
  return forgotten;
}

/** Whether an `exports` subpath of the package is internal (D-S7). */
function isInternal(manifest, subpath) {
  const internal = manifest.tsazor?.internal;
  return internal === true || (Array.isArray(internal) && internal.includes(subpath));
}

/** Compares (`--check`) or writes one snapshot file; `text` undefined means the file must not exist. */
function snapshot(file, text, packageName, internal) {
  const exists = existsSync(file);
  if (check) {
    const current = exists ? readFileSync(file, "utf8").replace(/\r\n/g, "\n") : undefined;
    if (current === text) return;
    failed = true;
    const kind = internal ? "internal API (no changelog entry needed)" : "public API";
    if (text === undefined || current === undefined) {
      console.error(`${packageName}: ${path.relative(root, file)} ${text === undefined ? "should not exist" : "is missing"} (${kind}).`);
      return;
    }
    const a = current.split("\n");
    const b = text.split("\n");
    let line = 0;
    while (line < a.length && line < b.length && a[line] === b[line]) line++;
    console.error(`${packageName}: the ${kind} differs from ${path.relative(root, file)} (first difference at line ${line + 1}):`);
    console.error(`  snapshot: ${a[line] ?? "(end)"}`);
    console.error(`  now:      ${b[line] ?? "(end)"}`);
  } else if (text === undefined) {
    if (exists) {
      rmSync(file);
      console.log(`removed ${path.relative(root, file)}`);
    }
  } else {
    writeFileSync(file, text);
    console.log(`wrote ${path.relative(root, file)}`);
  }
}

let failed = false;
if (!check) mkdirSync(apiDir, { recursive: true });
for (const { dir, manifest } of packages()) {
  const sections = [];
  const internalSections = [];
  const publicEntries = [];
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const types = typeof target === "string" ? target : target.types;
    if (!types || !types.endsWith(".d.ts")) continue;
    const entry = path.join(dir, types);
    if (!existsSync(entry)) {
      console.error(`${manifest.name}: ${types} is missing — run \`pnpm -r build\` first.`);
      process.exit(2);
    }
    const section = `/* ${manifest.name}${subpath === "." ? "" : subpath.slice(1)} */\n\n${surfaceOf(manifest.name, entry)}`;
    (isInternal(manifest, subpath) ? internalSections : sections).push(section);
    if (!isInternal(manifest, subpath)) publicEntries.push(entry);
  }
  for (const entry of publicEntries) {
    for (const [name, star] of shadowedStarExports(entry)) {
      failed = true;
      console.error(`${manifest.name}: its own ${name} hides ${star}'s, which its \`export *\` re-exports — rename one.`);
    }
  }
  for (const [name, owners] of forgottenExports(manifest.name, publicEntries)) {
    failed = true;
    console.error(`${manifest.name}: ${[...owners].join(", ")} name${owners.size === 1 ? "s" : ""} ${name}, which no public entry exports.`);
  }
  const base = path.join(apiDir, manifest.name.replace("@tsazor/", ""));
  const header = (kind) => `// API snapshot of ${manifest.name}${kind} — generated by scripts/api-snapshot.mjs; do not edit.\n\n`;
  snapshot(`${base}.api.d.ts`, sections.length > 0 ? `${header("")}${sections.join("\n")}` : undefined, manifest.name, false);
  const internalNote = " (internal: not covered by the stability promise, docs/support-policy.md D-S7)";
  snapshot(`${base}.internal.api.d.ts`, internalSections.length > 0 ? `${header(internalNote)}${internalSections.join("\n")}` : undefined, manifest.name, true);
}
for (const problem of skinParity()) {
  failed = true;
  console.error(`skin parity: ${problem}`);
}
if (failed) {
  console.error("\nIf the change is intended: `pnpm api:update`, and note a public API change in the changelog.");
  process.exit(1);
}
if (check) console.log("API snapshots match.");
