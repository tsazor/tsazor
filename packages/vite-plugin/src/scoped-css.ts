import { createHash } from "node:crypto";
import { relative as pathRelativeOf } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import { scopeSelector } from "@tsazor/compiler";

// The selector logic is pure and lives in the compiler (browser hosts reuse it).
export { scopeSelector };

/**
 * Scoped CSS (Blazor mechanism): rewrites the selectors of an `X.tsazor.css`
 * sidecar so they target the `b-<hash>` scope attribute the compiler emits on
 * X.tsazor's markup elements.
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

/** Full scope attribute name for a .tsazor file, e.g. "b-1a2b3c4d". */
export function scopeHashFor(projectRoot: string, filePath: string): string {
  const rel = pathRelativeOf(projectRoot, filePath).replace(/\\/g, "/");
  const digest = createHash("sha1").update(rel).digest("hex");
  return `b-${digest.slice(0, 8)}`;
}

export function scopedCssPostcssPlugin(scopeHash: string): PostcssPluginObject {
  return {
    postcssPlugin: "tsazor-scoped-css",
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

type PostcssPluginObject = {
  postcssPlugin: string;
  Rule(rule: Rule): void;
};