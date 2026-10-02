/**
 * Gate: every lesson's start state (app-a) and solution (app-b) compiles with
 * the in-browser pipeline and renders headlessly. The solution must be free
 * of diagnostics (errors and warnings); the start state may only fail where
 * the lesson declares it (`startFails: true` in its front-matter).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import { loadContent, parseFrontMatter } from "../build/content";
import { buildProject, MODULE_PREFIX, type ProjectBuild } from "../src/engine/compile-project";
import { readFileSync, existsSync } from "node:fs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = path.join(appRoot, "content");
const gateDir = path.join(appRoot, ".gate");
const content = loadContent(contentDir);
const lessons = content.parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));

/** Writes the modules as files; module ids become relative file imports. */
function writeModules(build: ProjectBuild, dir: string): string {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const module of Object.values(build.modules)) {
    const fileDir = path.posix.dirname(module.file);
    const code = module.code.replace(/(["'])\$app\/([^"']+)\1/g, (_match, quote: string, target: string) => {
      const relative = path.posix.relative(fileDir === "." ? "" : fileDir, target);
      return `${quote}${relative.startsWith(".") ? relative : `./${relative}`}.js${quote}`;
    });
    const out = path.join(dir, `${module.file}.js`);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, code);
  }
  return path.join(dir, `${build.entry!.slice(MODULE_PREFIX.length)}.js`);
}

function startFails(lessonDir: string): boolean {
  for (const track of ["blazor", "ts"]) {
    const file = path.join(contentDir, lessonDir, `${track}.md`);
    if (existsSync(file) && parseFrontMatter(readFileSync(file, "utf8")).data.startFails === "true") return true;
  }
  return false;
}

async function renderBuild(build: ProjectBuild, dir: string): Promise<{ html: string; errors: unknown[] }> {
  const entry = writeModules(build, dir);
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const module = (await import(pathToFileURL(entry).href)) as { default: never };
    const result = await render(module.default);
    const html = result.container.innerHTML;
    result.dispose();
    return { html, errors };
  } finally {
    console.error = original;
  }
}

const format = (build: ProjectBuild): string =>
  build.diagnostics.map((d) => `${d.file}(${d.line},${d.column + 1}) ${d.code} ${d.message}`).join("\n");

describe("tutorial lessons", () => {
  it("has the chapter-1 lessons in both tracks", () => {
    expect(lessons.length).toBeGreaterThanOrEqual(7);
    for (const lesson of lessons) {
      expect(Object.keys(lesson.text).sort(), lesson.slug).toEqual(["blazor", "ts"]);
    }
  });

  it("keeps the TypeScript track free of Blazor/Razor/C#/.NET references", () => {
    for (const lesson of lessons) {
      const text = readFileSync(path.join(contentDir, lesson.dir, "ts.md"), "utf8");
      expect(text, lesson.slug).not.toMatch(/Blazor|Razor|C#|\.NET|\.razor/i);
    }
  });

  for (const lesson of lessons) {
    describe(lesson.slug, () => {
      it("app-a compiles and renders", async () => {
        const build = buildProject(lesson.a);
        if (startFails(lesson.dir)) {
          expect(build.diagnostics.some((d) => d.severity === "error"), "declared startFails").toBe(true);
          return;
        }
        expect(build.diagnostics.filter((d) => d.severity === "error"), format(build)).toEqual([]);
        expect(build.entry, "App.tsazor compiled").toBeDefined();
        const { html, errors } = await renderBuild(build, path.join(gateDir, lesson.slug, "a"));
        expect(errors).toEqual([]);
        expect(html.length).toBeGreaterThan(0);
      });

      if (lesson.b) {
        it("app-b compiles without diagnostics and renders", async () => {
          const build = buildProject(lesson.b!);
          expect(build.diagnostics, format(build)).toEqual([]);
          const { html, errors } = await renderBuild(build, path.join(gateDir, lesson.slug, "b"));
          expect(errors).toEqual([]);
          expect(html.length).toBeGreaterThan(0);
          // The solution changes something visible (markup or styles).
          const a = buildProject(lesson.a);
          const before = a.entry ? (await renderBuild(a, path.join(gateDir, lesson.slug, "a2"))).html + a.css : "";
          expect(html + build.css).not.toBe(before);
        });
      }
    });
  }
});
