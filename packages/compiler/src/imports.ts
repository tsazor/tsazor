import ts from "typescript";

/**
 * Explicit module imports (`@import`) and syntactic export scans. Both use
 * the TS parser in syntax-only mode (no program, no checker): an `@import`
 * value is parsed as a real import declaration, and a module's exports are
 * read from its top-level statements.
 */

/** One local binding introduced by an import declaration. */
export interface ImportBinding {
  /** Local name in the importing module. */
  local: string;
  /** Exported name: `"default"`, `"*"` (namespace) or the named export. */
  imported: string;
  /** `import type …` / `import { type X }` — erased at runtime. */
  typeOnly: boolean;
}

/** A parsed `@import` directive (own or inherited from `_Imports.tsazor`). */
export interface ImportInfo {
  /** Module specifier as written (inherited relative ones are already rebased). */
  specifier: string;
  /** Empty for a side-effect import (`@import "./x.css"`). */
  bindings: ImportBinding[];
  /** Raw import-attributes clause (`with { type: "json" }`), if any. */
  attributes?: string;
}

export type ParsedImport = { ok: true; info: ImportInfo } | { ok: false; message: string };

const USAGE = "expected TypeScript import syntax, e.g. '@import { X } from \"./x\"', '@import X from \"./x\"', '@import * as ns from \"./x\"' or '@import \"./x.css\"'";

/** Parses the value of an `@import` directive (the text after the keyword). */
export function parseImportDirective(value: string): ParsedImport {
  if (value.trim().length === 0) return { ok: false, message: `Empty '@import': ${USAGE}.` };
  const text = `import ${value}`;
  const file = ts.createSourceFile("import.ts", text, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const parseDiagnostics = (file as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  const statement = file.statements[0];
  if (parseDiagnostics.length > 0 || file.statements.length !== 1 || !statement || !ts.isImportDeclaration(statement)) {
    const detail = parseDiagnostics[0] ? ` (${ts.flattenDiagnosticMessageText(parseDiagnostics[0].messageText, " ")})` : "";
    return { ok: false, message: `Invalid '@import'${detail}: ${USAGE}.` };
  }
  if (!ts.isStringLiteral(statement.moduleSpecifier)) {
    return { ok: false, message: `Invalid '@import': the module specifier must be a string literal.` };
  }
  const bindings: ImportBinding[] = [];
  const clause = statement.importClause;
  if (clause) {
    const clauseTypeOnly = clause.isTypeOnly;
    if (clause.name) bindings.push({ local: clause.name.text, imported: "default", typeOnly: clauseTypeOnly });
    const named = clause.namedBindings;
    if (named && ts.isNamespaceImport(named)) {
      bindings.push({ local: named.name.text, imported: "*", typeOnly: clauseTypeOnly });
    } else if (named) {
      for (const element of named.elements) {
        bindings.push({
          local: element.name.text,
          imported: (element.propertyName ?? element.name).text,
          typeOnly: clauseTypeOnly || element.isTypeOnly,
        });
      }
    }
  }
  const info: ImportInfo = { specifier: statement.moduleSpecifier.text, bindings };
  if (statement.attributes) info.attributes = text.slice(statement.attributes.getStart(file), statement.attributes.end);
  return { ok: true, info };
}

/**
 * Import statements for (possibly filtered) import infos. A default, a
 * namespace and the named bindings each get their own statement, so any
 * subset of an original declaration stays valid TS.
 */
export function importStatements(info: ImportInfo): string[] {
  const from = ` from ${JSON.stringify(info.specifier)}${info.attributes ? ` ${info.attributes}` : ""};`;
  if (info.bindings.length === 0) return [`import ${JSON.stringify(info.specifier)}${info.attributes ? ` ${info.attributes}` : ""};`];
  const lines: string[] = [];
  const named: string[] = [];
  for (const binding of info.bindings) {
    const type = binding.typeOnly ? "type " : "";
    if (binding.imported === "default") lines.push(`import ${type}${binding.local}${from}`);
    else if (binding.imported === "*") lines.push(`import ${type}* as ${binding.local}${from}`);
    else {
      const imported = /^[A-Za-z_$][\w$]*$/.test(binding.imported) ? binding.imported : JSON.stringify(binding.imported);
      named.push(`${type}${imported === binding.local ? imported : `${imported} as ${binding.local}`}`);
    }
  }
  if (named.length > 0) lines.push(`import { ${named.join(", ")} }${from}`);
  return lines;
}

/* Export scan ----------------------------------------------------------------- */

export interface ModuleExports {
  /** Named exports → whether the export is a runtime value (false: type-only). */
  names: Map<string, boolean>;
  /** The module has a default export. */
  hasDefault: boolean;
  /** Specifiers of `export * from "…"` re-exports (resolved by the caller). */
  reexportAll: string[];
}

const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false);

/** Syntactic export list of a TS/JS/d.ts module's top-level statements. */
export function scanModuleExports(source: string, fileName: string): ModuleExports {
  const kind = /\.d\.[mc]?ts$/.test(fileName) || /\.[mc]?ts$/.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, false, kind);
  const result: ModuleExports = { names: new Map(), hasDefault: false, reexportAll: [] };
  const add = (name: string, value: boolean): void => {
    if (name === "default") result.hasDefault = true;
    else result.names.set(name, value || (result.names.get(name) ?? false));
  };
  for (const statement of file.statements) {
    if (ts.isExportAssignment(statement)) {
      result.hasDefault = true;
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (!clause) {
        if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
          result.reexportAll.push(statement.moduleSpecifier.text);
        }
      } else if (ts.isNamespaceExport(clause)) {
        add(clause.name.text, !statement.isTypeOnly);
      } else {
        for (const element of clause.elements) add(element.name.text, !statement.isTypeOnly && !element.isTypeOnly);
      }
      continue;
    }
    if (!hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) {
      result.hasDefault = true;
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        for (const name of bindingNames(declaration.name)) add(name, true);
      }
    } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      add(statement.name.text, false);
    } else if (
      (ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) &&
      statement.name &&
      ts.isIdentifier(statement.name)
    ) {
      add(statement.name.text, true);
    }
  }
  return result;
}

function bindingNames(name: ts.BindingName): string[] {
  if (ts.isIdentifier(name)) return [name.text];
  const names: string[] = [];
  for (const element of name.elements) {
    if (ts.isBindingElement(element)) names.push(...bindingNames(element.name));
  }
  return names;
}
