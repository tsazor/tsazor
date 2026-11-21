/**
 * Gate for the keyword index (`/index`): every lesson text has keywords, and
 * every code-like keyword (`@bind:after`, `NavLink`, `vi.fn` — anything with
 * `@ . : # (` or an upper-case letter) occurs in that track's text or the
 * lesson's files, so a renamed API cannot leave a stale index entry behind.
 * Plain terms ("two-way binding", "i18n") are synonyms and may be absent.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadContent } from "../build/content";
import type { Track } from "../src/content-types";
import { buildIndex, isCodeLike } from "../src/keyword-index";

const contentDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");
const lessons = loadContent(contentDir).parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));

/** The rendered text without highlighting markup (tokens are split into spans). */
const plainText = (html: string): string =>
  html.replace(/<[^>]*>/g, "").replace(/&(lt|gt|quot|#39|amp);/g, (_, name: string) => ({ lt: "<", gt: ">", quot: "\"", "#39": "'", amp: "&" })[name]!);

describe("lesson keywords", () => {
  it.each(lessons.map((lesson) => [lesson.dir, lesson] as const))("%s", (_dir, lesson) => {
    const files = Object.values({ ...lesson.a, ...lesson.b }).join("\n");
    for (const [track, text] of Object.entries(lesson.text) as [Track, NonNullable<(typeof lesson.text)[Track]>][]) {
      expect(text.keywords.length, `${track}: front-matter needs keywords`).toBeGreaterThan(0);
      expect(new Set(text.keywords).size, `${track}: duplicate keywords`).toBe(text.keywords.length);
      const haystack = (plainText(text.html) + files).toLowerCase();
      const missing = text.keywords.filter(isCodeLike).filter((word) => !haystack.includes(word.toLowerCase()));
      expect(missing, `${track}: keywords not in the lesson`).toEqual([]);
    }
  });
});

describe("buildIndex", () => {
  const refs = lessons.filter((lesson) => lesson.text.ts).map((lesson, index) => ({ lesson, chapter: { slug: "", title: "", lessons: [] }, part: { slug: "", title: "", chapters: [] }, index }));
  const groups = buildIndex(refs, "ts");

  it("groups by initial letter, symbols first, letters in order", () => {
    expect(groups[0]!.id).toBe("symbols");
    const letters = groups.slice(1).map((group) => group.id);
    expect(letters).toEqual([...letters].sort());
    expect(new Set(letters).size).toBe(letters.length);
  });

  it("files directives under their name", () => {
    const b = groups.find((group) => group.id === "b")!;
    expect(b.entries.map((entry) => entry.keyword)).toContain("@bind");
    expect(groups.find((group) => group.id === "symbols")!.entries.map((entry) => entry.keyword)).toContain("#/");
  });

  it("lists every lesson of a keyword", () => {
    const bind = groups.flatMap((group) => group.entries).find((entry) => entry.keyword === "@bind")!;
    expect(bind.refs.map((ref) => ref.lesson.slug)).toEqual(expect.arrayContaining(["text-inputs", "numeric-inputs"]));
  });

  it("filters by query, case-insensitively", () => {
    const found = buildIndex(refs, "ts", "  NAVLINK ").flatMap((group) => group.entries.map((entry) => entry.keyword));
    expect(found).toEqual(expect.arrayContaining(["NavLink", "NavLinkMatch"]));
    expect(found.every((keyword) => keyword.toLowerCase().includes("navlink"))).toBe(true);
    expect(buildIndex(refs, "ts", "no such keyword")).toEqual([]);
  });
});
