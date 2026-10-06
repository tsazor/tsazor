/**
 * Gate: every lesson's start state (app-a) and solution (app-b) compiles with
 * the in-browser pipeline and renders headlessly — the way the preview runs
 * it (test/harness.ts: a head outlet next to the app, `Program.ts` when the
 * lesson has one). The solution must be free of diagnostics (errors and
 * warnings); the start state may only fail where the lesson declares it
 * (`startFails: true` in its front-matter). Both must pass the type check
 * (`tsazor check`), except a start state that is about its type errors
 * (`typeErrors: true`). The solution must differ visibly from the start —
 * after the `gate:` interaction steps, for behavior lessons; a refactoring
 * lesson (`refactor: true`) must instead render exactly the same.
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { loadContent, parseFrontMatter } from "../build/content";
import { buildProject, type ProjectBuild } from "../src/engine/compile-project";
import { loadTypeEnvironment } from "../build/type-env";
import { TypeChecker } from "../src/engine/type-check";
import { headSnapshot, mountWritten, runWrittenTests, writeModules } from "./harness";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = path.join(appRoot, "content");
const gateDir = path.join(appRoot, ".gate", "lessons");
const content = loadContent(contentDir);
const lessons = content.parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));

type FrontMatterKey = "startFails" | "typeErrors" | "gate" | "refactor";

/** A front-matter value set in either track's text (the first one found). */
function frontMatter(lessonDir: string, name: FrontMatterKey): string | undefined {
  for (const track of ["blazor", "ts"]) {
    const file = path.join(contentDir, lessonDir, `${track}.md`);
    const value = existsSync(file) ? parseFrontMatter(readFileSync(file, "utf8")).data[name] : undefined;
    if (value !== undefined) return value;
  }
  return undefined;
}
const flag = (lessonDir: string, name: FrontMatterKey): boolean => frontMatter(lessonDir, name) === "true";
const startFails = (lessonDir: string): boolean => flag(lessonDir, "startFails");

const checker = new TypeChecker(loadTypeEnvironment(appRoot));

/**
 * The `gate:` front-matter: interaction steps run on the start state and on
 * the solution before they are compared — for lessons whose solution only
 * differs in behavior. `;`-separated:
 *
 *   click <selector…>             element.click()
 *   check <selector…>             toggle checked, dispatch `change`
 *   change <selector> <value…>    set value, dispatch `change` (one-token selector)
 *   input <selector> <value…>     set value, dispatch `input`
 *   pointer <selector> <type>     dispatch a pointer event at (10, 20)
 *   wait <ms>                     let timers run
 *   look                          compare now, mid-flight (last step): the
 *                                 pending async work is not awaited first
 *
 * Returns true for `look`.
 */
async function runSteps(container: HTMLElement, steps: string | undefined): Promise<boolean> {
  for (const step of (steps ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    const [verb, ...rest] = step.split(/\s+/);
    if (verb === "look") return true;
    if (verb === "wait") {
      await new Promise((resolve) => setTimeout(resolve, Number(rest[0])));
      continue;
    }
    // click/check take the whole rest as the selector; the others a one-token selector + argument.
    const whole = verb === "click" || verb === "check";
    const selector = whole ? rest.join(" ") : rest[0]!;
    const args = whole ? [] : rest.slice(1);
    const element = container.querySelector(selector) as HTMLInputElement | null;
    if (!element) throw new Error(`gate step '${step}': no element matches '${selector}'`);
    if (verb === "click") element.click();
    else if (verb === "change" || verb === "input") {
      element.value = args.join(" ");
      element.dispatchEvent(new Event(verb, { bubbles: true }));
    } else if (verb === "check") {
      element.checked = !element.checked;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (verb === "pointer") {
      element.dispatchEvent(new MouseEvent(args[0]!, { bubbles: true, clientX: 10, clientY: 20 }));
    } else throw new Error(`gate step '${step}': unknown verb`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return false;
}

/** Form state is visible but not in the markup: values and checked flags join the snapshot. */
const formState = (container: HTMLElement): string =>
  [...container.querySelectorAll("input, select, textarea")]
    .map((el) => `${(el as HTMLInputElement).value}|${(el as HTMLInputElement).checked}`)
    .join(",");

/** An error an ErrorBoundary caught is the lesson working, not a failure. */
const handledByBoundary = (args: unknown[]): boolean => typeof args[0] === "string" && args[0].startsWith("[tsazor] ErrorBoundary handled:");

async function renderBuild(build: ProjectBuild, dir: string, steps?: string): Promise<{ html: string; errors: unknown[] }> {
  writeModules(build, dir);
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    if (!handledByBoundary(args)) errors.push(args);
  };
  try {
    const mounted = await mountWritten(build, dir);
    if (!(await runSteps(mounted.container, steps))) await mounted.settle();
    // The document head counts: PageTitle and HeadContent render there.
    const html = `${mounted.container.innerHTML}\n${formState(mounted.container)}\n${headSnapshot()}`;
    mounted.dispose();
    return { html, errors };
  } finally {
    console.error = original;
  }
}

const format = (build: ProjectBuild): string =>
  build.diagnostics.map((d) => `${d.file}(${d.line},${d.column + 1}) ${d.code} ${d.message}`).join("\n");

describe("tutorial lessons", () => {
  it("has the Part 1, 2 and 3 chapters, every lesson in both tracks but the Blazor-only C# chapter", () => {
    expect(content.parts[0]!.chapters.map((chapter) => chapter.title)).toEqual([
      "TypeScript for C# developers",
      "Introduction",
      "State & rendering",
      "Parameters",
      "Logic",
      "Events",
      "Bindings",
      "Classes & styles",
    ]);
    expect(content.parts[1]!.chapters.map((chapter) => chapter.title)).toEqual([
      "Reusing content",
      "Cascading values",
      "Services",
      "Element references",
      "Special components",
      "Organizing code",
      "Attachments",
    ]);
    expect(content.parts[2]!.chapters.map((chapter) => chapter.title)).toEqual(["Routing", "Forms", "Auth", "Talking to a backend", "Testing", "Localization", "Next steps"]);
    const csharp = content.parts[0]!.chapters[0]!.lessons;
    expect(csharp.length).toBeGreaterThanOrEqual(6);
    expect(csharp.length).toBeLessThanOrEqual(10);
    expect(content.parts[2]!.chapters[0]!.lessons.length).toBeGreaterThanOrEqual(6);
    expect(content.parts[2]!.chapters[1]!.lessons.length).toBeGreaterThanOrEqual(6);
    expect(lessons.length).toBeGreaterThanOrEqual(63 + csharp.length);
    for (const lesson of lessons) {
      const tracks = csharp.includes(lesson) ? ["blazor"] : ["blazor", "ts"];
      expect(Object.keys(lesson.text).sort(), lesson.slug).toEqual(tracks);
    }
  });

  it("keeps the TypeScript track free of Blazor/Razor/C#/.NET references", () => {
    for (const lesson of lessons) {
      if (!lesson.text.ts) continue;
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

      it("app-a passes the type check (unless the lesson is about its errors)", () => {
        const types = checker.check(lesson.a);
        if (flag(lesson.dir, "typeErrors")) expect(types.length, "declared typeErrors").toBeGreaterThan(0);
        else expect(types, format({ diagnostics: types } as ProjectBuild)).toEqual([]);
      });

      if (lesson.b) {
        it("app-b compiles without diagnostics and renders", async () => {
          const build = buildProject(lesson.b!);
          expect(build.diagnostics, format(build)).toEqual([]);
          const types = checker.check(lesson.b!);
          expect(types, format({ diagnostics: types } as ProjectBuild)).toEqual([]);
          const steps = frontMatter(lesson.dir, "gate");
          const { html, errors } = await renderBuild(build, path.join(gateDir, lesson.slug, "b"), steps);
          expect(errors).toEqual([]);
          expect(html.length).toBeGreaterThan(0);
          if (Object.keys(lesson.b!).some((file) => file.endsWith(".test.ts"))) {
            // A testing lesson: the preview runs its tests. The solution's all
            // pass; the start's report differs (a missing or failing test).
            const solved = await runWrittenTests(build, path.join(gateDir, lesson.slug, "b"));
            expect(solved.length, "the solution has tests").toBeGreaterThan(0);
            expect(solved.filter((result) => !result.passed), "the solution's tests pass").toEqual([]);
            const start = buildProject(lesson.a);
            const startDir = path.join(gateDir, lesson.slug, "a-tests");
            writeModules(start, startDir);
            const started = await runWrittenTests(start, startDir);
            expect(started, "the start's test report differs").not.toEqual(solved);
            return;
          }
          const a = buildProject(lesson.a);
          const before = a.entry ? (await renderBuild(a, path.join(gateDir, lesson.slug, "a2"), steps)).html + a.css : "";
          if (flag(lesson.dir, "refactor")) {
            // A refactoring moves code around: the app must render exactly as before.
            const strip = (s: string): string => s.replace(/\s+b-[0-9a-f]{8}=""/g, "").replace(/\/\* [^*]+ \*\/\n/g, "");
            expect(strip(html + build.css)).toBe(strip(before));
            expect(lesson.b).not.toEqual(lesson.a);
          } else {
            // The solution changes something visible (markup, form state, styles or
            // the document head), after the lesson's gate steps where its difference is behavior.
            expect(html + build.css).not.toBe(before);
          }
        });
      }
    });
  }
});
