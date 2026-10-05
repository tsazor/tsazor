/**
 * Builds the reference (Node, build time) — `virtual:tutorial-reference`:
 *
 * - Language: docs/language-reference.md as one page, with a table of
 *   contents and stable heading anchors (the file stays the single source).
 * - Components: the component manifests of @tsazor/runtime, components and
 *   fluent (`dist/tsazor-components.json`), docs rendered as Markdown.
 * - API: the public exports of runtime, testing, dotnet, vite-plugin (build/api.ts).
 * - Diagnostics: the compiler's DIAGNOSTIC_CATALOG, titled by its messages.
 *
 * Raw HTML in the Markdown is shown as text (docs say `<ul>` and mean the
 * tag), links to other docs files become plain text (they are not part of
 * the site), and `#section` links point at the language page.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Marked, type Tokens } from "marked";
import { DIAGNOSTIC_CATALOG, DIAGNOSTIC_MESSAGES, type ComponentManifest, type ComponentMetadata, type ComponentParameter } from "@tsazor/compiler";
import { loadApi } from "./api.js";
import { highlight } from "./highlight.js";
import type {
  ReferenceComponent,
  ReferenceContent,
  ReferenceDiagnostic,
  ReferenceHeading,
  ReferencePackage,
  ReferenceParameter,
} from "../src/reference-types.js";

export const LANGUAGE_PATH = "reference/language";

const PACKAGES: ReadonlyArray<Omit<ReferencePackage, "components"> & { dir: string; exclude?: string[] }> = [
  {
    slug: "runtime",
    name: "@tsazor/runtime",
    dir: "runtime",
    description: "The built-in components: routing, forms and inputs, validation, auth, sections, head content, error boundaries.",
    exclude: ["SectionOutletContentRenderer"],
  },
  { slug: "components", name: "@tsazor/components", dir: "components", description: "Bootstrap 5 components, written in .tsazor." },
  { slug: "fluent", name: "@tsazor/fluent", dir: "fluent", description: "Fluent UI 2 components with theme tokens, written in .tsazor." },
];

const escapeHtml = (text: string): string => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** GitHub-style heading anchor: lower case, punctuation dropped, spaces to dashes. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z#0-9]+;/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

function createMarkdown(headings?: ReferenceHeading[]): Marked {
  const used = new Map<string, number>();
  return new Marked({
    gfm: true,
    renderer: {
      code({ text, lang }) {
        const language = (lang ?? "").trim().split(/\s+/)[0] ?? "";
        return `<pre class="code" data-lang="${language}"><code>${highlight(text, language)}</code></pre>\n`;
      },
      html({ text }) {
        return escapeHtml(text);
      },
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const base = slugify(inner) || "section";
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        headings?.push({ id, html: inner, level: depth });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        if (/^https?:/.test(href)) return `<a href="${href}"${title ? ` title="${title}"` : ""} target="_blank" rel="noreferrer">${inner}</a>`;
        if (href.startsWith("#")) return `<a href="${LANGUAGE_PATH}${href}">${inner}</a>`;
        return `<span class="doc-link">${inner}</span>`;
      },
    },
  });
}

const docMarkdown = createMarkdown();

/** A doc comment as HTML (block) and its first sentence (inline, for lists). */
function renderDoc(doc: string | undefined): { html: string; summary: string } {
  if (!doc) return { html: "", summary: "" };
  const first = /^[\s\S]*?[.!?](?=\s|$)/.exec(doc.replace(/\s+/g, " ").trim())?.[0] ?? doc.split("\n")[0]!;
  return { html: docMarkdown.parse(doc) as string, summary: docMarkdown.parseInline(first) as string };
}

/** The attribute name in markup: `childContent` ⇒ `ChildContent` (Razor style; the camel form works too). */
const markupName = (name: string): string => name.charAt(0).toUpperCase() + name.slice(1);

function parameterOf(parameter: ComponentParameter, component: string): ReferenceParameter {
  const result: ReferenceParameter = {
    name: markupName(parameter.name),
    type: parameter.type ?? parameter.inferredType ?? "unknown",
    required: !parameter.optional && !parameter.hasInitializer && !parameter.cascading,
    doc: renderDoc(parameter.doc).html,
  };
  if (parameter.default !== undefined) result.default = parameter.default;
  if (parameter.cascading) result.cascading = parameter.cascading.name ?? parameter.cascading.type ?? "by type";
  if (parameter.declaredBy && parameter.declaredBy !== component) result.inheritedFrom = parameter.declaredBy;
  return result;
}

function componentOf(metadata: ComponentMetadata, packageSlug: string): ReferenceComponent {
  const { html, summary } = renderDoc(metadata.doc);
  const component: ReferenceComponent = {
    name: metadata.name,
    packageSlug,
    doc: html,
    summary,
    typeParameters: metadata.typeParameters.map((parameter) => (parameter.constraint ? `${parameter.name} extends ${parameter.constraint}` : parameter.name)),
    parameters: metadata.parameters.map((parameter) => parameterOf(parameter, metadata.name)),
  };
  if (metadata.abstract) component.baseClass = true;
  if (metadata.base && metadata.base.name !== "ComponentBase") component.extends = metadata.base.name;
  return component;
}

/** The compiler's diagnostic catalog, its message as the title (without the final period). */
function diagnostics(): ReferenceDiagnostic[] {
  return DIAGNOSTIC_CATALOG.map((entry) => {
    const diagnostic: ReferenceDiagnostic = {
      code: entry.code,
      id: entry.code.toLowerCase(),
      severity: entry.severity,
      title: docMarkdown.parseInline(DIAGNOSTIC_MESSAGES[entry.code as keyof typeof DIAGNOSTIC_MESSAGES].replace(/\.$/, "")) as string,
      description: docMarkdown.parse(entry.description) as string,
      fix: docMarkdown.parse(entry.fix) as string,
    };
    if (entry.example !== undefined) diagnostic.example = highlight(entry.example.replace(/\n$/, ""), "tsazor");
    if (entry.quickFix) diagnostic.quickFix = true;
    return diagnostic;
  });
}

export function loadReference(repoRoot: string): ReferenceContent {
  const packages: ReferencePackage[] = PACKAGES.map(({ dir, exclude = [], ...info }) => {
    const file = path.join(repoRoot, "packages", dir, "dist", "tsazor-components.json");
    if (!existsSync(file)) throw new Error(`${file} is missing — build the packages first (pnpm -r build).`);
    const manifest = JSON.parse(readFileSync(file, "utf8")) as ComponentManifest;
    const components = Object.values(manifest.components)
      .filter((metadata) => metadata.isComponent && !exclude.includes(metadata.name))
      .map((metadata) => componentOf(metadata, info.slug))
      .sort((a, b) => a.name.localeCompare(b.name, "en"));
    return { ...info, components };
  });

  const headings: ReferenceHeading[] = [];
  const source = readFileSync(path.join(repoRoot, "docs", "language-reference.md"), "utf8").replace(/\r\n/g, "\n");
  // The page has its own <h1>: the file's title line is dropped.
  const body = source.replace(/^# .*\n/, "");
  const html = createMarkdown(headings).parse(body) as string;
  const api = loadApi(repoRoot, {
    markdown: (text) => docMarkdown.parse(text) as string,
    inline: (text) => docMarkdown.parseInline(text) as string,
    componentHref: (slug, name) => {
      const pkg = packages.find((candidate) => candidate.slug === slug);
      return pkg?.components.some((component) => component.name === name) ? `reference/components/${slug}/${name}` : undefined;
    },
  });
  return { packages, api, language: { html, headings }, diagnostics: diagnostics() };
}
