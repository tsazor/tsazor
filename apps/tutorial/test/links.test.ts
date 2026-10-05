/**
 * Gate for the cross-links (build/reference-links.ts): every link the site
 * generates — in lesson texts, the language page, the index's keyword links,
 * "Learn it in" and the search entries — points at a page that exists (and
 * at an anchor that exists); the resolver maps the forms lessons write.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSite } from "../build/site";
import { referenceTargets } from "../build/reference-links";
import { searchReference } from "../src/keyword-index";
import type { Track } from "../src/content-types";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { content, reference } = loadSite(appRoot);
const lessons = content.parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));

/** Base-relative paths (with anchors) of every page of the site. */
function pages(): Set<string> {
  const result = new Set(["", "index", "reference", "reference/language", "reference/diagnostics"]);
  for (const lesson of lessons) for (const track of Object.keys(lesson.text) as Track[]) result.add(`${track}/${lesson.slug}`);
  for (const pkg of reference.packages) {
    result.add(`reference/components/${pkg.slug}`);
    for (const component of pkg.components) result.add(`reference/components/${pkg.slug}/${component.name}`);
  }
  for (const pkg of reference.api) {
    result.add(`reference/api/${pkg.slug}`);
    for (const symbol of pkg.symbols) result.add(`reference/api/${pkg.slug}/${symbol.name}`);
  }
  for (const heading of reference.language.headings) result.add(`reference/language#${heading.id}`);
  for (const diagnostic of reference.diagnostics) result.add(`reference/diagnostics#${diagnostic.id}`);
  return result;
}
const known = pages();

/** Internal hrefs in rendered HTML (external links and in-page anchors aside). */
const hrefsIn = (html: string): string[] =>
  [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!.replace(/&amp;/g, "&")).filter((href) => !/^(https?:|mailto:|#)/.test(href));

describe("cross-links", () => {
  it("lesson texts link only to pages that exist", () => {
    const broken: string[] = [];
    for (const lesson of lessons) {
      for (const [track, text] of Object.entries(lesson.text)) {
        for (const href of hrefsIn(text!.html)) if (!known.has(href)) broken.push(`${lesson.dir} (${track}): ${href}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("lesson texts link code spans to the reference, once per text", () => {
    const linked = lessons.flatMap((lesson) => Object.values(lesson.text).map((text) => text!.html)).join("\n");
    expect((linked.match(/class="ref-link"/g) ?? []).length).toBeGreaterThan(100);
    for (const lesson of lessons) {
      for (const text of Object.values(lesson.text)) {
        const targets = [...text!.html.matchAll(/class="ref-link" href="([^"]+)"/g)].map((match) => match[1]!);
        expect(new Set(targets).size, lesson.dir).toBe(targets.length);
      }
    }
  });

  it("the language page, the index links, Learn it in and the search point at pages that exist", () => {
    const hrefs = [
      ...hrefsIn(reference.language.html),
      ...Object.values(reference.keywordLinks).map((link) => link.href),
      ...reference.search.map((link) => link.href),
    ];
    const lessonLinks = [
      ...reference.packages.flatMap((pkg) => pkg.components.flatMap((component) => component.learnIn ?? [])),
      ...reference.api.flatMap((pkg) => pkg.symbols.flatMap((symbol) => symbol.learnIn ?? [])),
    ].flatMap((lesson) => (Object.keys(lesson.title) as Track[]).map((track) => `${track}/${lesson.slug}`));
    expect(lessonLinks.length).toBeGreaterThan(20);
    expect([...hrefs, ...lessonLinks].filter((href) => !known.has(href))).toEqual([]);
  });

  it("resolves the forms lessons write", () => {
    const { resolve } = referenceTargets(reference);
    const href = (text: string): string | undefined => resolve(text)?.href;
    expect(href("NavLink")).toBe("reference/components/runtime/NavLink");
    expect(href("<NavLink>")).toBe("reference/components/runtime/NavLink");
    expect(href("@Parameter()")).toBe("reference/api/runtime/Parameter");
    expect(href('navigateTo("/orders")')).toBeUndefined(); // a method, not an export
    expect(href("createTsazorApp({ root: App })")).toBe("reference/api/runtime/createTsazorApp");
    expect(href("TZS025")).toBe("reference/diagnostics#tzs025");
    expect(href("@bind:after")).toMatch(/^reference\/language#bind/);
    expect(href("@Required() @StringLength(80)")).toBeUndefined();
    expect(href("Badge")).toBeUndefined(); // library components: search only
    expect(href("Select(o => o.id)")).toBeUndefined();
  });

  it("the search ranks exact names first and finds library components", () => {
    expect(searchReference(reference.search, "navlink")[0]!.name).toBe("NavLink");
    expect(searchReference(reference.search, "Badge").map((hit) => hit.href)).toContain("reference/components/fluent/Badge");
    expect(searchReference(reference.search, "  ")).toEqual([]);
    expect(searchReference(reference.search, "tzs02").length).toBeGreaterThan(5);
  });
});
