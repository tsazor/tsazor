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
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(root, "api");
const check = process.argv.includes("--check");

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

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
  if (!moduleSymbol) return "// (no exports)\n";
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
      return printer.printNode(ts.EmitHint.Unspecified, statement, statement.getSourceFile());
    }))];
    blocks.push([`// ${name}`, ...printed].join("\n"));
  }
  return `${blocks.join("\n\n")}\n`;
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
  }
  const base = path.join(apiDir, manifest.name.replace("@tsazor/", ""));
  const header = (kind) => `// API snapshot of ${manifest.name}${kind} — generated by scripts/api-snapshot.mjs; do not edit.\n\n`;
  snapshot(`${base}.api.d.ts`, sections.length > 0 ? `${header("")}${sections.join("\n")}` : undefined, manifest.name, false);
  const internalNote = " (internal: not covered by the stability promise, docs/support-policy.md D-S7)";
  snapshot(`${base}.internal.api.d.ts`, internalSections.length > 0 ? `${header(internalNote)}${internalSections.join("\n")}` : undefined, manifest.name, true);
}
if (failed) {
  console.error("\nIf the change is intended: `pnpm api:update`, and note a public API change in the changelog.");
  process.exit(1);
}
if (check) console.log("API snapshots match.");
