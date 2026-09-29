import { createHash } from "node:crypto";
import { relative as pathRelativeOf } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";

/**
 * Scoped CSS (Blazor mechanism): rewrites the selectors of an `X.tazor.css`
 * sidecar so they target the `b-<hash>` scope attribute the compiler emits on
 * X.tazor's markup elements.
 *
 * Rules (Blazor parity, documented in docs/scoped-css.md):
 * - `.a > .b:hover`        → `.a[b-x] > .b[x]:hover` — attribute on the subject
 *   of every compound selector, before any pseudo-classes/elements.
 * - `.parent ::deep .child` → `.parent[b-x] .child` — markers before the first
 *   `::deep` are scoped; everything after stays unscoped (descendant scope).
 * - `::deep .child`        → `[b-x] .child` — the scope itself stands in for
 *   the marker when nothing precedes it.
 * - `@keyframes` rules are never touched; `@media`/`@supports` are traversed.
 */

const COMBINATORS = new Set([">", "+", "~"]);

/** Full scope attribute name for a .tazor file, e.g. "b-1a2b3c4d". */
export function scopeHashFor(projectRoot: string, filePath: string): string {
  const rel = pathRelativeOf(projectRoot, filePath).replace(/\\/g, "/");
  const digest = createHash("sha1").update(rel).digest("hex");
  return `b-${digest.slice(0, 8)}`;
}

export function scopedCssPostcssPlugin(scopeHash: string): PostcssPluginObject {
  return {
    postcssPlugin: "tasor-scoped-css",
    Rule(rule: Rule) {
      // Skip keyframes children (percent selectors) in all spellings.
      const parent = rule.parent;
      if (parent?.type === "atrule" && /keyframes$/i.test((parent as AtRule).name)) return;
      rule.selectors = rule.selectors.map((selector) => scopeSelector(selector, scopeHash));
    },
  };
}

/** Rewrites every selector of the sidecar CSS to target [scopeHash]. */
export async function processScopedCss(css: string, scopeHash: string, from: string): Promise<string> {
  const result = await postcss([scopedCssPostcssPlugin(scopeHash)]).process(css, { from });
  return result.css;
}

/** Splits at the first ::deep marker; head is scoped, tail stays raw. */
export function scopeSelector(selector: string, scopeHash: string): string {
  const deepIndex = findDeepMarker(selector);
  if (deepIndex < 0) return scopePart(selector, scopeHash);

  const head = selector.slice(0, deepIndex);
  const combinator = head.match(/\s*[>+~]\s*$/)?.[0] ?? "";
  const base = (combinator ? head.slice(0, head.length - combinator.length) : head).trim();
  const tail = stripDeepMarkers(selector.slice(deepIndex + 6)).trim();

  if (!base) {
    // Nothing before the marker: the scope attribute itself takes its place.
    return tail ? `[${scopeHash}] ${tail}` : `[${scopeHash}]`;
  }
  const scoped = scopePart(base, scopeHash);
  return combinator ? `${scoped} ${combinator.trim()} ${tail}` : tail ? `${scoped} ${tail}` : scoped;
}

function findDeepMarker(selector: string): number {
  const index = selector.toLowerCase().indexOf("::deep");
  // Only a standalone marker: it must not be part of a longer pseudo name.
  if (index < 0) return -1;
  const after = selector[index + 6];
  if (after && /[a-zA-Z0-9_-]/.test(after)) return -1;
  return index;
}

function stripDeepMarkers(part: string): string {
  let result = part;
  let guard = 0;
  while (guard++ < 10) {
    const index = findDeepMarker(result);
    if (index < 0) break;
    result = result.slice(0, index) + result.slice(index + 6);
  }
  return result;
}

/** Appends the hash attribute to the subject of each compound selector. */
function scopePart(part: string, scopeHash: string): string {
  const items: Array<{ combinator: string; compound: string }> = [];
  let compound = "";
  let pendingCombinator: string | null = null; // null = the next compound is the first
  let bracket = 0;
  let paren = 0;
  const flush = (): void => {
    const trimmed = compound.trim();
    compound = "";
    if (trimmed) items.push({ combinator: pendingCombinator ?? "", compound: trimmed });
  };
  for (let i = 0; i < part.length; i++) {
    const char = part[i]!;
    if (char === "[") { bracket++; compound += char; }
    else if (char === "]") { bracket = Math.max(0, bracket - 1); compound += char; }
    else if (bracket === 0 && char === "(") { paren++; compound += char; }
    else if (bracket === 0 && char === ")") { paren = Math.max(0, paren - 1); compound += char; }
    else if (bracket === 0 && paren === 0 && (COMBINATORS.has(char) || /\s/.test(char))) {
      flush();
      pendingCombinator = COMBINATORS.has(char) ? char : " ";
      // Skip further characters of the combinator's whitespace run.
      while (i + 1 < part.length && /\s/.test(part[i + 1]!)) i++;
    } else compound += char;
  }
  flush();

  return items
    .map((item, index) => {
      const scoped = scopeCompound(item.compound, scopeHash);
      if (index === 0) return scoped;
      if (item.combinator === " ") return ` ${scoped}`;
      return ` ${item.combinator.trim()} ${scoped}`;
    })
    .join("");
}

/**
 * Appends the attribute before trailing pseudo-classes (-elements), outside
 * brackets/parens: `.b:hover` → `.b[b-x]:hover`, `input[type=x]` →
 * `input[b-x][type=x]`, `.t::after` → `.t[b-x]::after`.
 */
function scopeCompound(compound: string, scopeHash: string): string {
  if (!compound) return "";
  let bracket = 0;
  let paren = 0;
  for (let i = 0; i < compound.length; i++) {
    const char = compound[i]!;
    if (char === "[") bracket++;
    else if (char === "]") bracket = Math.max(0, bracket - 1);
    else if (bracket === 0 && char === "(") paren++;
    else if (bracket === 0 && char === ")") paren = Math.max(0, paren - 1);
    else if (bracket === 0 && paren === 0 && char === ":" && compound[i - 1] !== "\\") {
      // A second `::` would mean the boundary lies earlier — colons cannot
      // appear bare at depth 0 before the pseudo prefix, so take the first.
      return `${compound.slice(0, i)}[${scopeHash}]${compound.slice(i)}`;
    }
  }
  return `${compound}[${scopeHash}]`;
}

type PostcssPluginObject = {
  postcssPlugin: string;
  Rule(rule: Rule): void;
};