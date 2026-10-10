/**
 * Markdown to safe HTML: marked (GitHub Flavored Markdown) renders it, DOMPurify removes what could run (scripts,
 * event handlers, `javascript:` links, styles), and links to another origin open in a new tab without access to the
 * page (`rel="noopener noreferrer"`). The text is never trusted, so an app can show an agent's or a user's text
 * without knowing about XSS (design-library-completeness.md, D-L3).
 */
import createDOMPurify, { type DOMPurify } from "dompurify";
import { Marked, type Tokens } from "marked";

export interface MarkdownOptions {
  /** A single newline is a line break, as in GitHub's comments and in chat text. Default false. */
  readonly breaks?: boolean;
  /** Only inline Markdown (emphasis, code, links): no paragraphs, lists or headings. Default false. */
  readonly inline?: boolean;
  /** Links to another origin open in a new tab ("new-tab", the default) or in place ("same"). */
  readonly externalLinks?: "new-tab" | "same";
  /**
   * Turns a fenced code block into HTML, e.g. with highlight.js (`(code, language) => hljs.highlight(code,
   * { language }).value`). The result is sanitized too. Without it the code is shown as text.
   */
  readonly highlight?: (code: string, language: string) => string;
  /** Tags to allow beyond the default set (DOMPurify's `ADD_TAGS`), e.g. `["iframe"]` for content an app trusts more. */
  readonly allowTags?: readonly string[];
  /** Attributes to allow beyond the default set (DOMPurify's `ADD_ATTR`). */
  readonly allowAttributes?: readonly string[];
  /** A class for tables (MudMarkdown's table styling; Bootstrap: `"table"`). */
  readonly tableClass?: string;
}

/** What the sanitizer always removes, beyond DOMPurify's defaults: an agent's text has no business styling the page. */
const FORBID_TAGS = ["style", "form"];
const FORBID_ATTR = ["style"];

/** The options of the sanitize call in progress (DOMPurify's hooks are synchronous). */
let current: MarkdownOptions = {};
let purifier: DOMPurify | undefined;

/** An instance of its own, so its hooks don't touch an app's own use of DOMPurify. */
function sanitizer(): DOMPurify {
  if (purifier !== undefined) return purifier;
  purifier = createDOMPurify(window);
  purifier.addHook("afterSanitizeAttributes", (node) => {
    if (node instanceof HTMLAnchorElement && node.hasAttribute("href")) {
      const external = isExternal(node.getAttribute("href") ?? "");
      if (external && (current.externalLinks ?? "new-tab") === "new-tab") node.setAttribute("target", "_blank");
      if (external || node.hasAttribute("target")) node.setAttribute("rel", "noopener noreferrer");
    }
    if (node instanceof HTMLTableElement && current.tableClass) node.classList.add(...current.tableClass.split(/\s+/).filter(Boolean));
    // A task list's checkbox (`- [x] baked`) is named by its item's text, as a screen reader needs it.
    if (node instanceof HTMLInputElement && node.type === "checkbox" && node.parentElement instanceof HTMLLIElement) {
      const text = [...node.parentElement.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent ?? "").join("").trim();
      if (text !== "") node.setAttribute("aria-label", text);
    }
  });
  return purifier;
}

/** A link to another origin (`https://other.example/…`, `//cdn…`); a relative link and a `#fragment` stay in the app. */
function isExternal(href: string): boolean {
  if (!/^([a-z][a-z0-9+.-]*:)?\/\//i.test(href)) return false;
  try {
    return new URL(href, window.location.href).origin !== window.location.origin;
  } catch {
    return true;
  }
}

const parsers = new Map<string, Marked>();

function parserFor(options: MarkdownOptions): Marked {
  const key = `${options.breaks === true}|${options.highlight === undefined ? "" : "h"}`;
  let parser = parsers.get(key);
  if (parser !== undefined && options.highlight === undefined) return parser;
  parser = new Marked({ gfm: true, breaks: options.breaks === true, async: false });
  const highlight = options.highlight;
  if (highlight !== undefined) {
    parser.use({
      renderer: {
        code({ text, lang }: Tokens.Code): string {
          const language = (lang ?? "").trim().split(/\s+/)[0] ?? "";
          const className = language === "" ? "" : ` class="language-${escapeAttribute(language)}"`;
          return `<pre><code${className}>${highlight(text, language)}</code></pre>\n`;
        },
      },
    });
  } else {
    parsers.set(key, parser);
  }
  return parser;
}

function escapeAttribute(text: string): string {
  return text.replace(/[&"<>]/g, (character) => `&#${character.charCodeAt(0)};`);
}

/** The Markdown as sanitized HTML. */
export function renderMarkdown(text: string, options: MarkdownOptions = {}): string {
  const parser = parserFor(options);
  const html = options.inline === true ? parser.parseInline(text) : parser.parse(text);
  current = options;
  try {
    return sanitizer().sanitize(html as string, {
      USE_PROFILES: { html: true },
      FORBID_TAGS,
      FORBID_ATTR,
      ADD_TAGS: [...(options.allowTags ?? [])],
      ADD_ATTR: ["target", ...(options.allowAttributes ?? [])],
    });
  } finally {
    current = {};
  }
}

/** The same rendering: a component re-renders without parsing again while these stay. */
export function sameMarkdownOptions(a: MarkdownOptions, b: MarkdownOptions): boolean {
  return a.breaks === b.breaks && a.inline === b.inline && a.externalLinks === b.externalLinks && a.highlight === b.highlight
    && a.tableClass === b.tableClass && sameList(a.allowTags, b.allowTags) && sameList(a.allowAttributes, b.allowAttributes);
}

function sameList(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  return (a ?? []).join("\u0000") === (b ?? []).join("\u0000");
}
