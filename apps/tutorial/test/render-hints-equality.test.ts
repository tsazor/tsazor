/**
 * H1 gate (docs/design-render-hints.md, Gates): every lesson project — start
 * and solution — built with render hints (stable event handlers) and without,
 * rendered the way the preview renders it, must produce the same DOM (body and
 * head) — first as rendered, then after clicking every button once, so the
 * hoisted handlers run and the re-renders they cause are compared too.
 */
import path from "node:path";
import { rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { buildProject, type Files } from "../src/engine/compile-project";
import { loadContent } from "../build/content";
import { headSnapshot, mountWritten, writeModules } from "./harness";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gateDir = path.join(appRoot, ".gate", "render-hints");
const lessons = loadContent(path.join(appRoot, "content")).parts.flatMap((part) => part.chapters.flatMap((chapter) => chapter.lessons));
let counter = 0;

afterAll(() => rmSync(gateDir, { recursive: true, force: true }));

/** Waits for the renderer, but no longer than a handler's own delays would take. */
const settled = (settle: (ms?: number) => Promise<void>): Promise<unknown> =>
  Promise.race([settle(), new Promise((resolve) => setTimeout(resolve, 50))]);

/** The rendered DOM of a build (null when it doesn't compile), before and after clicking every button. */
async function render(files: Files, renderHints: boolean): Promise<{ html: string; hoisted: number } | null> {
  const build = buildProject(files, { renderHints });
  if (build.diagnostics.some((d) => d.severity === "error") || !build.entry) return null;
  const hoisted = Object.values(build.modules).reduce((sum, module) => sum + (module.code.match(/\.bindWith\(/g)?.length ?? 0), 0);
  const dir = path.join(gateDir, String(counter++));
  writeModules(build, dir);
  const original = console.error;
  console.error = () => {}; // lessons about errors log them; the DOM is what's compared
  try {
    const mounted = await mountWritten(build, dir, { onError: () => {} });
    await mounted.settle();
    const snapshots = [`${mounted.container.innerHTML}\n${headSnapshot()}`];
    for (const button of [...mounted.container.querySelectorAll<HTMLElement>("button")]) {
      if (!button.isConnected) continue;
      button.click();
      await settled(mounted.settle);
      snapshots.push(mounted.container.innerHTML);
    }
    mounted.dispose();
    return { html: snapshots.join("\n---\n"), hoisted };
  } finally {
    console.error = original;
  }
}

describe("H1 — stable event handlers render the same DOM as a closure per render", () => {
  let hoistedTotal = 0;
  let projects = 0;

  for (const lesson of lessons) {
    for (const [variant, files] of [["start", lesson.a], ["solution", lesson.b]] as const) {
      if (!files) continue;
      it(`${lesson.slug} (${variant})`, async () => {
        const withHints = await render(files, true);
        const reference = await render(files, false);
        if (withHints === null || reference === null) {
          expect(withHints === null, "both builds compile, or neither").toBe(reference === null);
          return;
        }
        projects++;
        hoistedTotal += withHints.hoisted;
        expect(reference.hoisted).toBe(0);
        if (withHints.html !== reference.html) {
          // A lesson whose output changes by itself (a clock, a random roll, a timer) is not comparable.
          const again = await render(files, false);
          if (again!.html !== reference.html) return;
        }
        expect(withHints.html).toBe(reference.html);
      });
    }
  }

  it("the gate compared real projects and real hoisted handlers", () => {
    expect(projects).toBeGreaterThan(150);
    expect(hoistedTotal).toBeGreaterThan(50);
  });
});
