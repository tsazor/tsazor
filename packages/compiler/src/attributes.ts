import ts from "typescript";

/**
 * `@authorize` and C# attribute lists of `@attribute [...]` (roadmap A5/A6,
 * review C19). The TS forms are `@authorize` / `@authorize({ roles, policy })`
 * (route metadata) and `@attribute @decorator(…)` (a real class decorator,
 * never parsed here). C# attribute lists have no TS meaning: codegen reports
 * them (TZS021) with the TS form computed from the parsed list.
 */

/** The route's AuthorizationRequirements (`{}`: authentication suffices). */
export interface AuthorizeRequirement {
  roles?: string[];
  policy?: string;
}

/**
 * What one `_Imports.tsazor` passes on to the pages below it (B12, Blazor's `@attribute [Authorize]` and
 * `[AllowAnonymous]` in an _Imports.razor): its `@authorize` requirement and its `@allowAnonymous`.
 */
export interface InheritedAuthorization {
  /** The layer's `@authorize` (`{}`: authentication suffices); absent when it has none. */
  authorize?: AuthorizeRequirement;
  allowAnonymous?: boolean;
  /** The _Imports file, as the page's diagnostics name it. */
  file?: string;
}

/** The authorization an `_Imports.tsazor` passes on, from its compiled metadata; undefined when it passes none. */
export function inheritedAuthorizationOf(
  metadata: { authorize?: boolean; authorizeData?: AuthorizeRequirement; allowAnonymous?: boolean },
  file?: string,
): InheritedAuthorization | undefined {
  if (!metadata.authorize && !metadata.allowAnonymous) return undefined;
  return {
    ...(metadata.authorize ? { authorize: { ...(metadata.authorizeData ?? {}) } } : {}),
    ...(metadata.allowAnonymous ? { allowAnonymous: true } : {}),
    ...(file !== undefined ? { file } : {}),
  };
}

/**
 * The value of `@authorize` after the directive name: empty, or one TS
 * object literal in parentheses — `({ roles: ["A", "B"], policy: "P" })` —
 * parsed with the TS parser; only string literals are accepted (the
 * requirement is static route metadata). A string is the error detail.
 */
export function parseAuthorizeArgument(value: string): AuthorizeRequirement | string {
  if (value.trim() === "") return {};
  const usage = "expected '@authorize' or '@authorize({ roles: [\"A\"], policy: \"P\" })'";
  const file = ts.createSourceFile("authorize.ts", `authorize${value}\n;`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const statement = file.statements[0];
  const syntaxErrors = (file as unknown as { parseDiagnostics?: readonly unknown[] }).parseDiagnostics ?? [];
  if (syntaxErrors.length > 0 || file.statements.length !== 1 || !statement || !ts.isExpressionStatement(statement)) return usage;
  const call = statement.expression;
  if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.arguments.length > 1) return usage;
  const arg = call.arguments[0];
  if (arg === undefined) return {};
  if (!ts.isObjectLiteralExpression(arg)) return `${usage} (the argument is an object literal)`;
  const requirement: AuthorizeRequirement = {};
  const literal = (node: ts.Expression): string | null =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
  for (const property of arg.properties) {
    const name = ts.isPropertyAssignment(property) ? property.name : undefined;
    const key = name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) ? name.text : undefined;
    if (!ts.isPropertyAssignment(property) || (key !== "roles" && key !== "policy")) {
      return `unknown property '${property.getText(file)}' — only 'roles' and 'policy' apply`;
    }
    if (key in requirement) return `duplicate property '${key}'`;
    if (key === "policy") {
      const policy = literal(property.initializer);
      if (policy === null) return `'policy' must be a string literal (got '${property.initializer.getText(file)}')`;
      requirement.policy = policy;
      continue;
    }
    const list = property.initializer;
    const roles = ts.isArrayLiteralExpression(list) ? list.elements.map((element) => literal(element)) : null;
    if (roles === null || roles.some((role) => role === null)) {
      return `'roles' must be an array of string literals (got '${list.getText(file)}')`;
    }
    requirement.roles = roles as string[];
  }
  return requirement;
}

export interface CSharpAttributeArgument {
  /** Named argument (`Roles = "A"`); undefined for a positional one. */
  name?: string;
  /** Argument source text, trimmed. */
  value: string;
}

export interface CSharpAttribute {
  /** Simple name without namespace and `Attribute` suffix (`Authorize`). */
  name: string;
  /** The name as written (`Microsoft.AspNetCore.Authorization.Authorize`). */
  written: string;
  args: CSharpAttributeArgument[];
}

/**
 * Parses one or more attribute lists (`[A]`, `[A, B(x)]`, `[A][B]`); null
 * when the text is not an attribute list. Strings, chars and nested
 * brackets/parentheses are skipped when splitting.
 */
export function parseAttributeLists(text: string): CSharpAttribute[] | null {
  const attributes: CSharpAttribute[] = [];
  let i = 0;
  for (;;) {
    while (i < text.length && /\s/.test(text[i]!)) i++;
    if (i >= text.length) break;
    if (text[i] !== "[") return null;
    const end = closing(text, i);
    if (end < 0) return null;
    let body = text.slice(i + 1, end);
    // An attribute target (`[assembly: X]`, `[type: X]`) changes nothing here.
    const target = /^\s*[A-Za-z]+\s*:(?!:)/.exec(body);
    if (target) body = body.slice(target[0].length);
    for (const item of splitTopLevel(body)) {
      const match = /^\s*(@?[A-Za-z_][\w.]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(item);
      if (!match) return null;
      const written = match[1]!.replace(/^@/, "");
      const simple = written.split(".").pop()!;
      const name = simple.length > "Attribute".length && simple.endsWith("Attribute") ? simple.slice(0, -"Attribute".length) : simple;
      const args = match[2] === undefined || match[2].trim() === ""
        ? []
        : splitTopLevel(match[2]).map((arg): CSharpAttributeArgument => {
            const named = /^\s*([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]*)$/.exec(arg);
            return named ? { name: named[1]!, value: named[2]!.trim() } : { value: arg.trim() };
          });
      attributes.push({ name, written, args });
    }
    i = end + 1;
  }
  return attributes.length > 0 ? attributes : null;
}

/**
 * The TS replacement of one C# attribute, for the TZS021 message (the
 * codemod's mapping): `[Authorize(Roles = "A, B", Policy = "P")]` ⇒
 * `@authorize({ roles: ["A", "B"], policy: "P" })`, `[AllowAnonymous]` ⇒
 * `@allowAnonymous`, anything else ⇒ remove, or a TS class decorator.
 */
export function typescriptFormOf(attribute: CSharpAttribute): string {
  switch (attribute.name) {
    case "Authorize": {
      const form = authorizeDirectiveOf(attribute);
      return form === null ? "'@authorize({ roles: [\"…\"], policy: \"…\" })' with string literals" : `'${form}'`;
    }
    case "AllowAnonymous":
      return "'@allowAnonymous'";
    case "Route":
      return "'@page \"…\"'";
    case "CascadingTypeParameter": {
      const form = cascadingTypeParameterDirectiveOf(attribute);
      return form === null ? "'@attribute @CascadingTypeParameter(\"T\")'" : `'${form}'`;
    }
    default:
      return "a TS class decorator ('@attribute @decorator(…)'), or remove it";
  }
}

/**
 * The directive that mechanically replaces `@attribute [<attribute>]` (the
 * TZS021 fix): `@authorize…` for a literal `[Authorize]`, `@page "…"` for a
 * literal `[Route("…")]`, `@allowAnonymous` for `[AllowAnonymous]`; null when the
 * replacement needs a decision (decorator or removal, non-literal values).
 */
export function directiveReplacementOf(attribute: CSharpAttribute): string | null {
  switch (attribute.name) {
    case "Authorize":
      return authorizeDirectiveOf(attribute);
    case "AllowAnonymous":
      return attribute.args.length === 0 ? "@allowAnonymous" : null;
    case "Route": {
      const template = attribute.args.length === 1 && attribute.args[0]!.name === undefined ? csharpString(attribute.args[0]!.value) : null;
      return template === null ? null : `@page ${JSON.stringify(template)}`;
    }
    case "CascadingTypeParameter":
      return cascadingTypeParameterDirectiveOf(attribute);
    default:
      return null;
  }
}

/** `@attribute @CascadingTypeParameter("TItem")` for `[CascadingTypeParameter(nameof(TItem))]` (or a string literal), else null. */
function cascadingTypeParameterDirectiveOf(attribute: CSharpAttribute): string | null {
  const names = attribute.args.map((arg) => (arg.name === undefined ? (/^nameof\(\s*([A-Za-z_]\w*)\s*\)$/.exec(arg.value)?.[1] ?? csharpString(arg.value)) : null));
  if (names.length === 0 || names.some((name) => name === null || name === undefined)) return null;
  return `@attribute @CascadingTypeParameter(${names.map((name) => JSON.stringify(name)).join(", ")})`;
}

/** `@authorize` / `@authorize({ roles: […], policy: "…" })` for `[Authorize(…)]` with literal values, else null. */
function authorizeDirectiveOf(attribute: CSharpAttribute): string | null {
  const requirement: AuthorizeRequirement = {};
  let literal = true;
  attribute.args.forEach((arg, index) => {
    const key = arg.name ?? (index === 0 ? "Policy" : undefined);
    const text = csharpString(arg.value);
    if (key === "Roles" && text !== null) requirement.roles = text.split(",").map((role) => role.trim()).filter((role) => role.length > 0);
    else if (key === "Policy" && text !== null) requirement.policy = text;
    else if (key === "Roles" || key === "Policy") literal = false;
  });
  if (!literal) return null;
  const parts = [
    ...(requirement.roles !== undefined ? [`roles: [${requirement.roles.map((role) => JSON.stringify(role)).join(", ")}]`] : []),
    ...(requirement.policy !== undefined ? [`policy: ${JSON.stringify(requirement.policy)}`] : []),
  ];
  return parts.length > 0 ? `@authorize({ ${parts.join(", ")} })` : "@authorize";
}

/** The value of a C# string literal (`"a\"b"`, verbatim `@"a""b"`), or null. */
export function csharpString(text: string): string | null {
  const verbatim = /^@"((?:[^"]|"")*)"$/.exec(text);
  if (verbatim) return verbatim[1]!.replace(/""/g, '"');
  const regular = /^"((?:[^"\\\n]|\\.)*)"$/.exec(text);
  if (!regular) return null;
  try {
    return JSON.parse(`"${regular[1]!.replace(/\\'/g, "'")}"`) as string;
  } catch {
    return null;
  }
}

/** Index of the bracket closing the one at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      i = skipQuoted(text, i);
      continue;
    }
    if (ch === "[" || ch === "(") depth++;
    else if (ch === "]" || ch === ")") {
      depth--;
      if (depth === 0) return ch === "]" ? i : -1;
    }
  }
  return -1;
}

/** Splits on commas outside strings, parentheses and brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (ch === '"' || ch === "'") {
      i = skipQuoted(text, i);
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Index of the closing quote of the literal starting at `at` (verbatim `@"…"` doubles quotes). */
function skipQuoted(text: string, at: number): number {
  const quote = text[at]!;
  const verbatim = at > 0 && text[at - 1] === "@";
  for (let i = at + 1; i < text.length; i++) {
    if (verbatim) {
      if (text[i] === quote) {
        if (text[i + 1] === quote) i++;
        else return i;
      }
      continue;
    }
    if (text[i] === "\\") i++;
    else if (text[i] === quote) return i;
  }
  return text.length;
}
