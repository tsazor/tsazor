/**
 * Scoped CSS in the browser: a small stylesheet walker around the compiler's
 * `scopeSelector` (the same selector logic the Vite plugin applies via
 * postcss). Rule preludes are rewritten; `@media`/`@supports`/`@layer`/
 * `@container` blocks are traversed; `@keyframes`, `@font-face` and other
 * at-rule bodies are left alone. Comments and strings are skipped safely.
 */
import { scopeSelector } from "@tsazor/compiler";

/** Scope attribute for a project file (`b-` + 8 hex chars, FNV-1a over the path). */
export function scopeHashFor(file: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < file.length; i++) {
    hash ^= file.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `b-${hash.toString(16).padStart(8, "0")}`;
}

const TRAVERSED_AT_RULES = /^@(media|supports|layer|container|document)\b/i;

/** Splits a selector list at top-level commas (not inside `()`/`[]`/strings). */
function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const char of prelude) {
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    else if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/** Rewrites every rule selector of `css` to target `[scopeHash]`. */
export function scopeCss(css: string, scopeHash: string): string {
  let output = "";
  let i = 0;
  /** Per open block: does its content hold rules to scope? */
  const stack: boolean[] = [];
  let prelude = "";
  const inScopableBlock = (): boolean => stack.length === 0 || stack[stack.length - 1] === true;

  while (i < css.length) {
    const char = css[i]!;
    // Comments pass through verbatim.
    if (char === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end < 0 ? css.length : end + 2;
      // Between rules a comment goes straight to the output; inside a prelude it is dropped on rewrite.
      if (prelude.trim() === "") {
        output += prelude + css.slice(i, stop);
        prelude = "";
      } else prelude += css.slice(i, stop);
      i = stop;
      continue;
    }
    if (char === '"' || char === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== char) j += css[j] === "\\" ? 2 : 1;
      prelude += css.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (char === "{") {
      const text = prelude.trim();
      const leading = prelude.slice(0, prelude.length - prelude.trimStart().length);
      if (text.startsWith("@")) {
        stack.push(TRAVERSED_AT_RULES.test(text) && inScopableBlock());
        output += prelude + "{";
      } else if (inScopableBlock()) {
        const selectors = splitSelectors(stripComments(text)).map((selector) => scopeSelector(selector, scopeHash));
        output += `${leading}${selectors.join(", ")} {`;
        stack.push(false); // declarations (or nested rules — left as written)
      } else {
        output += prelude + "{";
        stack.push(false);
      }
      prelude = "";
      i++;
      continue;
    }
    if (char === "}") {
      output += prelude + "}";
      prelude = "";
      stack.pop();
      i++;
      continue;
    }
    if (char === ";" && prelude.trim().startsWith("@")) {
      output += prelude + ";";
      prelude = "";
      i++;
      continue;
    }
    prelude += char;
    i++;
  }
  return output + prelude;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ");
}
