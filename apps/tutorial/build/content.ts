/**
 * Reads the tutorial content tree (Node, build time):
 *
 *   content/<part>/meta.json                    { "title": "Basics" }
 *   content/<part>/common/…                     base files of every lesson in the part
 *   content/<part>/<chapter>/meta.json          { "title": "Introduction" }
 *   content/<part>/<chapter>/<lesson>/blazor.md  Blazor track text (front-matter: title, keywords, focus)
 *   content/<part>/<chapter>/<lesson>/ts.md      TypeScript track text
 *   content/<part>/<chapter>/<lesson>/app-a/…   start state
 *   content/<part>/<chapter>/<lesson>/app-b/…   solution (only the changed files)
 *
 * Directory names carry an ordering prefix (`01-welcome`); the slug is the
 * name without it. A lesson with only one of the two .md files exists only in
 * that track.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Marked } from "marked";
import { highlight } from "./highlight.js";
import type { Track, TutorialContent, LessonContent, ChapterContent, PartContent, LessonFiles } from "../src/content-types.js";

export const TRACKS: readonly Track[] = ["blazor", "ts"];

const marked = new Marked({
  gfm: true,
  renderer: {
    code({ text, lang }) {
      const language = (lang ?? "").trim().split(/\s+/)[0] ?? "";
      return `<pre class="code" data-lang="${language}"><code>${highlight(text, language)}</code></pre>\n`;
    },
    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      const external = /^https?:/.test(href);
      return `<a href="${href}"${title ? ` title="${title}"` : ""}${external ? ' target="_blank" rel="noreferrer"' : ""}>${inner}</a>`;
    },
  },
});

const slugOf = (name: string): string => name.replace(/^\d+-/, "");

const sortedDirs = (dir: string): string[] =>
  readdirSync(dir)
    .filter((name) => /^\d+-/.test(name) && statSync(path.join(dir, name)).isDirectory())
    .sort();

function readMeta(dir: string): { title: string } {
  const file = path.join(dir, "meta.json");
  if (!existsSync(file)) throw new Error(`Missing meta.json in ${dir}`);
  return JSON.parse(readFileSync(file, "utf8")) as { title: string };
}

/** All files below `dir`, keyed by POSIX path relative to it. */
export function readFiles(dir: string): LessonFiles {
  const files: Record<string, string> = {};
  if (!existsSync(dir)) return files;
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else files[path.relative(dir, full).replace(/\\/g, "/")] = readFileSync(full, "utf8").replace(/\r\n/g, "\n");
    }
  };
  walk(dir);
  return files;
}

/** Splits `---\nkey: value\n---` front-matter from the markdown body. */
export function parseFrontMatter(source: string): { data: Record<string, string>; body: string } {
  const text = source.replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const pair = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (pair) data[pair[1]!] = pair[2]!.replace(/^["']|["']$/g, "");
  }
  return { data, body: text.slice(match[0].length) };
}

export function loadContent(contentDir: string): TutorialContent {
  const parts: PartContent[] = [];
  const slugs = new Set<string>();
  for (const partName of sortedDirs(contentDir)) {
    const partDir = path.join(contentDir, partName);
    const common = readFiles(path.join(partDir, "common"));
    const chapters: ChapterContent[] = [];
    for (const chapterName of sortedDirs(partDir)) {
      const chapterDir = path.join(partDir, chapterName);
      const lessons: LessonContent[] = [];
      for (const lessonName of sortedDirs(chapterDir)) {
        const lessonDir = path.join(chapterDir, lessonName);
        const slug = slugOf(lessonName);
        if (slugs.has(slug)) throw new Error(`Duplicate lesson slug '${slug}' (${lessonDir})`);
        slugs.add(slug);
        const a = { ...common, ...readFiles(path.join(lessonDir, "app-a")) };
        const bOnly = readFiles(path.join(lessonDir, "app-b"));
        const lesson: LessonContent = {
          slug,
          dir: path.relative(contentDir, lessonDir).replace(/\\/g, "/"),
          text: {},
          a,
          b: Object.keys(bOnly).length > 0 ? { ...a, ...bOnly } : null,
        };
        for (const track of TRACKS) {
          const file = path.join(lessonDir, `${track}.md`);
          if (!existsSync(file)) continue;
          const { data, body } = parseFrontMatter(readFileSync(file, "utf8"));
          if (!data.title) throw new Error(`${file}: front-matter needs a title`);
          const focus = data.focus ?? Object.keys(bOnly)[0] ?? Object.keys(a)[0] ?? "App.tsazor";
          const keywords = (data.keywords ?? "").split(",").map((word) => word.trim()).filter(Boolean);
          lesson.text[track] = { title: data.title, focus, keywords, html: marked.parse(body) as string };
        }
        if (Object.keys(lesson.text).length === 0) throw new Error(`${lessonDir}: no blazor.md or ts.md`);
        lessons.push(lesson);
      }
      chapters.push({ slug: slugOf(chapterName), title: readMeta(chapterDir).title, lessons });
    }
    parts.push({ slug: slugOf(partName), title: readMeta(partDir).title, chapters });
  }
  return { parts };
}
