/**
 * The search terms in a text, for a highlighter (Fluent UI Blazor's FluentHighlighter, MudBlazor's MudHighlighter):
 * the text in pieces, each marked when it matches a term. Plain text only — the pieces are rendered as text, so a
 * term or a text with markup in it stays text.
 */

/** A piece of the text, and whether it matches a term. */
export interface HighlightFragment {
  readonly text: string;
  readonly highlighted: boolean;
}

/** Options of `highlightFragments`. */
export interface HighlightOptions {
  /** Upper and lower case count (default false). */
  caseSensitive?: boolean;
  /** A match runs on to the end of its word (`blaz` marks all of "Blazor"; default false). */
  untilNextBoundary?: boolean;
}

const escape = (term: string): string => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `text` in pieces at the terms (empty terms are left out; the longest is tried first where two start alike). One
 * piece, not marked, when there is nothing to find.
 */
export function highlightFragments(text: string, terms: readonly string[], options: HighlightOptions = {}): HighlightFragment[] {
  if (text === "") return [];
  const patterns = [...new Set(terms.filter((term) => term !== ""))]
    .sort((a, b) => b.length - a.length)
    .map((term) => escape(term) + (options.untilNextBoundary ? "[\\p{L}\\p{N}_]*" : ""));
  if (patterns.length === 0) return [{ text, highlighted: false }];
  const pattern = new RegExp(patterns.join("|"), options.caseSensitive ? "gu" : "giu");
  const fragments: HighlightFragment[] = [];
  let at = 0;
  for (const match of text.matchAll(pattern)) {
    if (match[0] === "") continue;
    if (match.index > at) fragments.push({ text: text.slice(at, match.index), highlighted: false });
    fragments.push({ text: match[0], highlighted: true });
    at = match.index + match[0].length;
  }
  if (at < text.length) fragments.push({ text: text.slice(at), highlighted: false });
  return fragments;
}

/** The terms of a search text: split at any of `delimiters` (Fluent UI Blazor's `Delimiters`, " ,;"), or whole. */
export function highlightTerms(highlightedText: string | undefined, delimiters = "", more: readonly string[] = []): string[] {
  const text = highlightedText ?? "";
  const split = delimiters === "" ? [text] : text.split(new RegExp(`[${delimiters.replace(/[\]\\^-]/g, "\\$&")}]`));
  return [...split, ...more].map((term) => term.trim()).filter((term) => term !== "");
}
