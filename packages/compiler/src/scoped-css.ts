/**
 * Scoped CSS selector rewriting (Blazor's CSS isolation): pure string logic,
 * no postcss and no Node APIs — shared by the Vite plugin (which walks the
 * stylesheet with postcss) and browser hosts such as the tutorial app.
 *
 * - `.a > .b:hover`        → `.a[b-x] > .b[b-x]:hover`
 * - `.parent ::deep .child` → `.parent[b-x] .child`
 * - `::deep .child`        → `[b-x] .child`
 */

const COMBINATORS = new Set([">", "+", "~"]);

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
