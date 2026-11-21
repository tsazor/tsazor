/**
 * esbuild's helpers, once per app instead of once per component. esbuild lowers the standard decorators (no engine runs
 * them natively yet) and writes the helpers that do it — about 1.7 KB minified — at the top of every module it
 * transforms; a bundler keeps each copy (they are module-scoped). In an app of 150 components that was half its
 * compiled code. Here the helpers become one module: a probe that uses every kind of decorator yields esbuild's whole
 * helper set (the same esbuild, the same options), and each component imports from it what it used. A helper the
 * shared module lacks — another esbuild version, a name esbuild had to change — stays in the component, so nothing
 * breaks.
 */
import ts from "typescript";

/** A class with every kind of standard decorator and private member: lowered, it needs every helper esbuild has for them. */
export const DECORATOR_HELPER_PROBE = `
const d = (value: unknown, _context: unknown): any => value;
@d
export class Probe {
  @d static s = 1;
  @d static accessor sa = 1;
  @d static sm() {}
  @d static #sp = 1;
  @d f = 1;
  @d accessor a = 1;
  @d m() {}
  @d get g() { return 1; }
  @d set g(_value: number) {}
  @d #p = 1;
  @d accessor #pa = 1;
  @d #pm() {}
  @d get #pg() { return 1; }
  @d set #pg(_value: number) {}
  read(o: object) { return [this.#p, this.#pa, this.#pm(), this.#pg, Probe.#sp, #p in o]; }
  write() { this.#p = 2; this.#pa = 2; this.#pg = 2; Probe.#sp = 2; }
}
`;

/** The helper declarations at the top of an esbuild module: `var __name = …;`, each with the range it spans. */
interface HelperStatement {
  readonly names: readonly string[];
  readonly start: number;
  readonly end: number;
}

function leadingHelpers(js: string): HelperStatement[] {
  const source = ts.createSourceFile("module.js", js, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const helpers: HelperStatement[] = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) break;
    const names = statement.declarationList.declarations.map((declaration) => (ts.isIdentifier(declaration.name) ? declaration.name.text : ""));
    if (names.some((name) => !name.startsWith("__"))) break;
    helpers.push({ names, start: statement.getStart(source), end: statement.end });
  }
  return helpers;
}

/** esbuild's helpers as one module. */
export interface SharedHelpers {
  /** The module: the helper declarations, exported. */
  readonly code: string;
  /** Each declaration as esbuild wrote it (`var __name = …;`): a module's own copy is shared only if it is the same text. */
  readonly declarations: ReadonlySet<string>;
}

/** The shared module, from esbuild's output for the probe: its helpers, exported. */
export function sharedHelperModule(probeJs: string): SharedHelpers {
  const helpers = leadingHelpers(probeJs);
  const declarations = helpers.map((helper) => probeJs.slice(helper.start, helper.end));
  const code = `${declarations.join("\n")}\nexport { ${helpers.flatMap((helper) => helper.names).join(", ")} };\n`;
  return { code, declarations: new Set(declarations) };
}

/**
 * The module with the shared helpers imported from `specifier` instead of declared. Each declaration it drops leaves
 * its line breaks behind, so every line keeps its number and the module's source map stays right.
 */
export function shareHelpers(js: string, helpers: SharedHelpers, specifier: string): string {
  const shared = leadingHelpers(js).filter((helper) => helpers.declarations.has(js.slice(helper.start, helper.end)));
  if (shared.length === 0) return js;
  let out = "";
  let last = 0;
  for (const helper of shared) {
    out += js.slice(last, helper.start) + js.slice(helper.start, helper.end).replace(/[^\n]/g, "");
    last = helper.end;
  }
  out += js.slice(last);
  return `import { ${shared.flatMap((helper) => helper.names).join(", ")} } from ${JSON.stringify(specifier)};${out}`;
}
