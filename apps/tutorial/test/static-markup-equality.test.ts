/**
 * F1a gate (docs/design-static-markup.md §5): every lesson project — start
 * and solution — built with static markup blocks and without, rendered the
 * way the preview renders it, must produce the same DOM (body and head).
 */
import path from "node:path";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { buildProject, type Files } from "../src/engine/compile-project";
import { loadContent } from "../build/content";
import { headSnapshot, mountWritten, writeModules } from "./harness";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateDir = path.join(appRoot, ".gate", "static-markup");
const lessons = loadContent(path.join(appRoot, "content")).parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));
let counter = 0;

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));

/** The rendered DOM of a build (null when it doesn't compile), as the preview shows it. */
async function render(files: Files, staticMarkup: boolean): Promise<{ html: string; blocks: number } | null> {
  const build = buildProject(files, { staticMarkup });
  if (build.diagnostics.some((d) => d.severity === "error") || !build.entry) return null;
  const blocks = Object.values(build.modules).reduce((sum, module) => sum + (module.code.match(/addMarkupContent\(/g)?.length ?? 0), 0);
  const dir = path.join(gateDir, String(counter++));
  writeModules(build, dir);
  const original = console.error;
  console.error = () => {}; // lessons about errors log them; the DOM is what's compared
  try {
    const mounted = await mountWritten(build, dir, { onError: () => {} });
    await mounted.settle();
    const html = `${mounted.container.innerHTML}\n${headSnapshot()}`;
    mounted.dispose();
    return { html, blocks };
  } finally {
    console.error = original;
  }
}

describe("F1a — static markup blocks render the same DOM as element frames", () => {
  let blocksTotal = 0;
  let projects = 0;

  for (const lesson of lessons) {
    for (const [variant, files] of [["start", lesson.a], ["solution", lesson.b]] as const) {
      if (!files) continue;
      it(`${lesson.slug} (${variant})`, async () => {
        const withBlocks = await render(files, true);
        const reference = await render(files, false);
        if (withBlocks === null || reference === null) {
          expect(withBlocks === null, "both builds compile, or neither").toBe(reference === null);
          return;
        }
        projects++;
        blocksTotal += withBlocks.blocks;
        if (withBlocks.html !== reference.html) {
          // A lesson whose first render changes by itself (a clock, a random roll) is not comparable.
          const again = await render(files, false);
          if (again!.html !== reference.html) return;
        }
        expect(withBlocks.html).toBe(reference.html);
      });
    }
  }

  it("the gate compared real projects and real blocks", () => {
    expect(projects).toBeGreaterThan(150);
    expect(blocksTotal).toBeGreaterThan(300);
  });
});
