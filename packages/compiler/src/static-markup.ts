/**
 * F1a — static markup blocks (docs/design-static-markup.md). An element
 * whose whole subtree is static becomes one `addMarkupContent` frame, as
 * Razor's markup blocks. The block must produce exactly the DOM the element
 * frames would: the runtime parses the string once and clones it, so every
 * shape where the HTML parser would build a different tree (implicit
 * `<tbody>`, `<p>` closed by a `<div>`, a leading newline in `<pre>`,
 * `<template>` content, unknown camelCase names in SVG) stays out, and so do
 * the elements whose attributes the renderer applies as properties (form
 * controls) and `style` attributes (a strict CSP blocks them in parsed
 * markup — D-S3).
 */
import type { ElementNode, MarkupNode } from "./ast.js";
import { decodeHtmlEntities } from "./entities.js";

/** Elements a block never contains: raw text, form controls, parser-special or document-level. */
const EXCLUDED_ELEMENTS = new Set([
  "script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript", "plaintext",
  "input", "select", "option", "optgroup", "datalist",
  "template", "pre", "listing", "math",
  "html", "head", "body", "frameset", "frame",
]);

/** HTML void elements: written without a closing tag; never with children. */
const VOID_ELEMENTS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "keygen", "link", "meta", "param", "source", "track", "wbr"]);

/** Attributes the renderer applies as properties (form state), and `style` (D-S3). */
const EXCLUDED_ATTRIBUTES = new Set(["style", "value", "checked", "selected"]);

/** A start tag of one of these closes an open `<p>` in the HTML parser. */
const CLOSES_P = new Set([
  "address", "article", "aside", "blockquote", "center", "details", "dialog", "dir", "div", "dl", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "main",
  "menu", "nav", "ol", "p", "pre", "section", "summary", "table", "ul", "listing", "plaintext", "xmp",
]);
const HEADINGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
/** The parser closes an open element of the same name for these (or refuses to nest them). */
const NO_SELF_NESTING = new Set(["a", "form", "button", "nobr"]);

/** The table structure the parser accepts as written (anything else is moved or wrapped). */
const TABLE_CHILDREN: Record<string, ReadonlySet<string>> = {
  table: new Set(["caption", "colgroup", "thead", "tbody", "tfoot"]),
  thead: new Set(["tr"]),
  tbody: new Set(["tr"]),
  tfoot: new Set(["tr"]),
  tr: new Set(["td", "th"]),
  colgroup: new Set(["col"]),
};

/** SVG names the HTML parser writes in camelCase (its adjustment tables); other upper-case names it lowers. */
const SVG_TAGS = new Set([
  "altGlyph", "altGlyphDef", "altGlyphItem", "animateColor", "animateMotion", "animateTransform", "clipPath",
  "feBlend", "feColorMatrix", "feComponentTransfer", "feComposite", "feConvolveMatrix", "feDiffuseLighting",
  "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR",
  "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology", "feOffset", "fePointLight",
  "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence", "foreignObject", "glyphRef", "linearGradient",
  "radialGradient", "textPath",
]);
const SVG_ATTRIBUTES = new Set([
  "attributeName", "attributeType", "baseFrequency", "baseProfile", "calcMode", "clipPathUnits", "diffuseConstant",
  "edgeMode", "filterUnits", "glyphRef", "gradientTransform", "gradientUnits", "kernelMatrix", "kernelUnitLength",
  "keyPoints", "keySplines", "keyTimes", "lengthAdjust", "limitingConeAngle", "markerHeight", "markerUnits",
  "markerWidth", "maskContentUnits", "maskUnits", "numOctaves", "pathLength", "patternContentUnits",
  "patternTransform", "patternUnits", "pointsAtX", "pointsAtY", "pointsAtZ", "preserveAlpha",
  "preserveAspectRatio", "primitiveUnits", "refX", "refY", "repeatCount", "repeatDur", "requiredExtensions",
  "requiredFeatures", "specularConstant", "specularExponent", "spreadMethod", "startOffset", "stdDeviation",
  "stitchTiles", "surfaceScale", "systemLanguage", "tableValues", "targetX", "targetY", "textLength", "viewBox",
  "viewTarget", "xChannelSelector", "yChannelSelector", "zoomAndPan",
]);

const NAME = /^[A-Za-z][A-Za-z0-9-]*$/;
const ATTRIBUTE_NAME = /^[A-Za-z_:][A-Za-z0-9_:.-]*$/;

const escapeText = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (text: string): string => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Whitespace-only text spanning lines: the element frames drop it, so the block does too. */
const isInsignificant = (node: MarkupNode): boolean => node.kind === "text" && /^\s+$/.test(node.content) && node.content.includes("\n");

/**
 * The markup string of `node` when its whole subtree is a static block, else
 * null. `scopeHash` is written into every element, first, as the element
 * frames emit it.
 */
export function staticMarkupOf(node: ElementNode, scopeHash: string | undefined): string | null {
  const out: string[] = [];
  return write(node, [], scopeHash, out) ? out.join("") : null;
}

function write(node: ElementNode, ancestors: readonly string[], scopeHash: string | undefined, out: string[]): boolean {
  const tag = node.tagName;
  const lower = tag.toLowerCase();
  if (node.isComponent || !NAME.test(tag) || EXCLUDED_ELEMENTS.has(lower)) return false;
  if (tag !== lower && !SVG_TAGS.has(tag)) return false;
  if (!parserKeeps(lower, ancestors)) return false;

  const seen = new Set<string>();
  const attributes: string[] = [];
  if (scopeHash) attributes.push(` ${scopeHash}=""`);
  for (const attribute of node.attributes) {
    // Directive attributes (`@attach`, `@ref`, `@onclick`, …) need frames of their own.
    if (attribute.kind !== "static") return false;
    const name = attribute.name;
    const key = name.toLowerCase();
    if (!ATTRIBUTE_NAME.test(name) || EXCLUDED_ATTRIBUTES.has(key) || key.startsWith("on") || seen.has(key)) return false;
    if (name !== key && !SVG_ATTRIBUTES.has(name)) return false;
    if (scopeHash && key === scopeHash.toLowerCase()) return false;
    seen.add(key);
    attributes.push(attribute.minimized ? ` ${name}` : ` ${name}="${escapeAttribute(decodeHtmlEntities(attribute.value))}"`);
  }

  const children = node.children.filter((child) => !isInsignificant(child));
  if (VOID_ELEMENTS.has(lower)) {
    if (children.length > 0) return false;
    out.push(`<${tag}${attributes.join("")}>`);
    return true;
  }
  const allowed = TABLE_CHILDREN[lower];
  out.push(`<${tag}${attributes.join("")}>`);
  const inner = [...ancestors, lower];
  for (const child of children) {
    if (child.kind === "text") {
      // Text directly in table structure is moved out by the parser (foster parenting).
      if (allowed !== undefined && child.content.trim().length > 0) return false;
      out.push(escapeText(decodeHtmlEntities(child.content)));
    } else if (child.kind === "element") {
      if (allowed !== undefined && !allowed.has(child.tagName.toLowerCase())) return false;
      if (!write(child, inner, scopeHash, out)) return false;
    } else {
      return false;
    }
  }
  out.push(`</${tag}>`);
  return true;
}

/** Whether the HTML parser keeps `tag` where the source put it, below `ancestors` (inside this block). */
function parserKeeps(tag: string, ancestors: readonly string[]): boolean {
  if (CLOSES_P.has(tag) && ancestors.includes("p")) return false;
  if (NO_SELF_NESTING.has(tag) && ancestors.includes(tag)) return false;
  if (HEADINGS.has(tag) && ancestors.some((ancestor) => HEADINGS.has(ancestor))) return false;
  if (tag === "li" && nearest(ancestors, ["li", "ul", "ol", "menu"]) === "li") return false;
  if ((tag === "dd" || tag === "dt") && ["dd", "dt"].includes(nearest(ancestors, ["dd", "dt", "dl"]) ?? "")) return false;
  // Table parts outside their parent are dropped or regrouped by the parser.
  const parent = ancestors[ancestors.length - 1];
  if (["tr", "td", "th", "thead", "tbody", "tfoot", "caption", "colgroup", "col"].includes(tag) && parent !== undefined && TABLE_CHILDREN[parent] === undefined) return false;
  return true;
}

function nearest(ancestors: readonly string[], names: readonly string[]): string | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) if (names.includes(ancestors[i]!)) return ancestors[i];
  return undefined;
}
