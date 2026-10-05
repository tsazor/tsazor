/**
 * Cross-links between the lessons, the keyword index and the reference
 * (Node, build time):
 *
 * - the targets: every component, API export, diagnostic code and the
 *   language page's directive headings (`@bind …`, `@import`), by name;
 * - `resolveTarget("NavLink" | "@bind:after" | "<NavLink>" | "@Parameter()" | "TZS025")`
 *   — the reference entry a code span or keyword names, if any;
 * - "Learn it in" on component and API pages: the lessons whose keywords
 *   name the entry; `keywordLinks` for the index; `search` entries for the
 *   index's search box.
 *
 * Names are matched exactly (case-sensitive): `render` the function is not
 * `Render`. A few lower-case API names that read as plain words are not
 * targets (`default`); the library components (`Badge`, `Card`, `Select`)
 * are found by the search but never linked automatically — lessons write
 * their own components with those names.
 */
import type { TutorialContent, Track } from "../src/content-types.js";
import type { LessonLink, ReferenceContent, ReferenceLink } from "../src/reference-types.js";
import { LANGUAGE_PATH } from "./reference.js";

const NOT_TARGETS = new Set(["default"]);
/** Component packages whose names are link targets (the built-ins). */
const LINKED_COMPONENT_PACKAGES = new Set(["runtime"]);

export interface ReferenceTargets {
  resolve(text: string): ReferenceLink | undefined;
  all: ReferenceLink[];
}

const plain = (html: string): string =>
  html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

export function referenceTargets(reference: ReferenceContent): ReferenceTargets {
  const byName = new Map<string, ReferenceLink>();
  const add = (link: ReferenceLink): void => {
    if (!byName.has(link.name)) byName.set(link.name, link);
  };
  // Components first: a component class's API entry points at its component page anyway.
  // Library components (Badge, Card, Select …) are search entries only: lessons write
  // their own components with such names.
  const searchOnly: ReferenceLink[] = [];
  for (const pkg of reference.packages) {
    for (const component of pkg.components) {
      const link: ReferenceLink = { name: component.name, href: `reference/components/${pkg.slug}/${component.name}`, kind: "component", detail: pkg.name };
      if (LINKED_COMPONENT_PACKAGES.has(pkg.slug)) add(link);
      else searchOnly.push(link);
    }
  }
  for (const pkg of reference.api) {
    for (const symbol of pkg.symbols) {
      if (NOT_TARGETS.has(symbol.name)) continue;
      add({ name: symbol.name, href: symbol.component ?? `reference/api/${pkg.slug}/${symbol.name}`, kind: "api", detail: `${pkg.name} · ${symbol.kind}` });
    }
  }
  for (const diagnostic of reference.diagnostics) {
    add({ name: diagnostic.code, href: `reference/diagnostics#${diagnostic.id}`, kind: "diagnostic", detail: plain(diagnostic.title) });
  }
  // Directive headings: "@bind (Blazor .NET 7 semantics)" names `@bind`, "@authorize and @attribute" both.
  const directives = new Map<string, ReferenceLink>();
  const headings: ReferenceLink[] = [];
  for (const heading of reference.language.headings) {
    if (heading.level > 3) continue;
    const text = plain(heading.html);
    const link: ReferenceLink = { name: text, href: `${LANGUAGE_PATH}#${heading.id}`, kind: "language", detail: "Language reference" };
    headings.push(link);
    for (const match of text.matchAll(/(?:^|\s)(@[a-z][\w-]*)/g)) {
      if (!directives.has(match[1]!)) directives.set(match[1]!, link);
    }
  }

  const resolve = (text: string): ReferenceLink | undefined => {
    const trimmed = text.trim();
    const candidates = [
      trimmed,
      trimmed.replace(/\(\)$/, ""), // `@Parameter()`, `observe()`
      trimmed.replace(/^<\/?([A-Za-z][\w.]*)[^>]*\/?>$/, "$1"), // `<NavLink>`, `<NavLink />`
      trimmed.replace(/^@([A-Z]\w*)(\([^@]*\))?$/, "$1"), // one decorator: `@Parameter({ … })` → Parameter
      trimmed.replace(/^([a-z_$][\w$]*)\(.*\)$/, "$1"), // function calls: `navigateTo("/x")` → navigateTo
    ];
    for (const candidate of candidates) {
      const found = byName.get(candidate);
      if (found) return found;
    }
    // Directives and their modifiers: `@bind:after` → the `@bind` section; `@page "/x"` → `@page`.
    const directive = /^(@[a-z][\w-]*)/.exec(trimmed)?.[1];
    if (directive) return directives.get(directive) ?? directives.get(directive.replace(/-.*$/, ""));
    return undefined;
  };

  return { resolve, all: [...byName.values(), ...searchOnly, ...headings] };
}

/** Normalized keyword ⇒ lessons, per track, from the lessons' front-matter keywords. */
function lessonsByTarget(content: TutorialContent, targets: ReferenceTargets): Map<string, LessonLink[]> {
  const result = new Map<string, LessonLink[]>();
  for (const part of content.parts) {
    for (const chapter of part.chapters) {
      for (const lesson of chapter.lessons) {
        const hrefs = new Set<string>();
        for (const text of Object.values(lesson.text)) {
          for (const keyword of text?.keywords ?? []) {
            const target = targets.resolve(keyword);
            if (target) hrefs.add(target.href);
          }
        }
        const title: Partial<Record<Track, string>> = {};
        for (const [track, text] of Object.entries(lesson.text) as [Track, { title: string }][]) title[track] = text.title;
        for (const href of hrefs) {
          const list = result.get(href) ?? [];
          list.push({ slug: lesson.slug, title, chapter: chapter.title });
          result.set(href, list);
        }
      }
    }
  }
  return result;
}

/** Adds "Learn it in", the index's keyword links and the search entries to the reference. */
export function linkReference(reference: ReferenceContent, content: TutorialContent, targets: ReferenceTargets): void {
  const lessons = lessonsByTarget(content, targets);
  for (const pkg of reference.packages) {
    for (const component of pkg.components) {
      const learnIn = lessons.get(`reference/components/${pkg.slug}/${component.name}`);
      if (learnIn) component.learnIn = learnIn;
    }
  }
  for (const pkg of reference.api) {
    for (const symbol of pkg.symbols) {
      if (symbol.component) continue; // its component page has them
      const learnIn = lessons.get(`reference/api/${pkg.slug}/${symbol.name}`);
      if (learnIn) symbol.learnIn = learnIn;
    }
  }
  const keywordLinks: Record<string, ReferenceLink> = {};
  for (const part of content.parts) {
    for (const chapter of part.chapters) {
      for (const lesson of chapter.lessons) {
        for (const text of Object.values(lesson.text)) {
          for (const keyword of text?.keywords ?? []) {
            const target = targets.resolve(keyword);
            if (target) keywordLinks[keyword] = target;
          }
        }
      }
    }
  }
  reference.keywordLinks = keywordLinks;
  reference.search = targets.all;
}
