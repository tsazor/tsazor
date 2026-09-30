/**
 * C# attribute lists of `@attribute [...]` (roadmap A5, review C19). C#
 * attributes have no TS equivalent: codegen maps the authorization ones
 * (`[Authorize]`, `[AllowAnonymous]`) onto route metadata and ignores the
 * rest with a warning; the TS form `@attribute @decorator(…)` is emitted as
 * a real class decorator and never reaches this parser.
 */

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
