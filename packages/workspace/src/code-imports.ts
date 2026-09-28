import { RUNTIME_PACKAGE, RUNTIME_TYPES } from "./builtins";
import { relativeSpecifier } from "./imports";
import type { FileContext } from "./resolver";

/**
 * Scans a .tazor source for PascalCase identifiers that reference runtime
 * exports or resolvable component classes, and returns the import lines that
 * make them usable inside verbatim @code blocks (and @inject/@inherits,
 * which the compiler already imports itself).
 */
export function collectCodeImports(source: string, compiledCode: string, context: FileContext): string[] {
  const bindings = collectImportedBindings(compiledCode);
  const candidates = new Set<string>();
  for (const match of source.matchAll(/\b[A-Z][A-Za-z0-9_$]*\b/g)) {
    candidates.add(match[0]);
  }
  const imports: string[] = [];
  for (const name of candidates) {
    if (bindings.has(name)) continue;
    if (RUNTIME_TYPES.has(name)) {
      imports.push(`import { ${name} } from "${RUNTIME_PACKAGE}";`);
      continue;
    }
    const file = context.resolveImportable(name);
    if (file) {
      imports.push(`import ${name} from "${relativeSpecifier(context.fileDir, file)}";`);
    }
  }
  return imports;
}

/** Every local binding name declared by the import statements of a TS module. */
function collectImportedBindings(code: string): Set<string> {
  const bindings = new Set<string>();
  for (const line of code.split("\n")) {
    const match = /^import\s+([^;]+?)\s+from\s+"[^"]*";?\s*$/.exec(line);
    if (!match) continue;
    const clause = match[1]!;
    const named = /\{([^}]*)\}/.exec(clause);
    const defaultClause = clause.replace(/\{[^}]*\}/g, "").replace(/,\s*$/, "").trim();
    if (defaultClause) {
      bindings.add(defaultClause.replace(/^\*\s+as\s+/, "").trim());
    }
    if (named) {
      for (const piece of named[1]!.split(",")) {
        const binding = piece.trim().split(/\s+as\s+/).pop()!.trim();
        if (binding) bindings.add(binding);
      }
    }
  }
  return bindings;
}