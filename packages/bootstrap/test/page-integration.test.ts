/**
 * End-to-end integration: compiles a real demo page (.tsazor) through the same
 * resolution as the vite plugin, evaluates the module and mounts it in
 * happy-dom. Guards the full compiler → runtime → DOM path against
 * regressions that hand-built render trees cannot catch (e.g. the Razor
 * method-group conversion for event parameters — a bare `this.handler` used
 * to be invoked with the wrong receiver, so the owning page never re-rendered).
 */
import { describe, expect, it } from "vitest";
import { compile } from "@tsazor/compiler";
import { collectImports, createFileContext, resolutionOptions } from "@tsazor/workspace";
import { transformSync } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Renderer, ServiceCollection } from "@tsazor/runtime";
import { Toaster } from "@tsazor/ui";

/** The services the page injects (the demo's Program.ts registers them). */
const services = () => new ServiceCollection().registerType(Toaster, { singleton: true }).build();

/* Anchor on this test file, not on CWD: the root vitest projects config runs
 * packages from the repo root, so relative paths would resolve there. */
const here = path.dirname(fileURLToPath(new URL(import.meta.url)));
const pagePath = path.resolve(here, "../../../apps/demo/src/Pages/ComponentsDemo.tsazor");
const root = path.resolve(here, "../../../apps/demo");

/** Same pipeline as the vite plugin / library build: shared resolution + esbuild. */
async function compilePage(): Promise<string> {
  const source = await readFile(pagePath, "utf8");
  const chain = await collectImports(path.dirname(pagePath), root);
  const context = createFileContext(pagePath, chain);
  const compiled = compile(source, { ...resolutionOptions(context), generateSourceMap: false });
  const js = transformSync(compiled.code, {
    loader: "ts",
    sourcefile: pagePath,
    supported: { decorators: false },
    tsconfigRaw: { compilerOptions: { target: "es2022" } },
  }).code;
  await mkdir(path.resolve(here, ".build"), { recursive: true });
  const out = path.resolve(here, ".build/ComponentsDemo.page.mjs");
  await writeFile(out, js);
  return out;
}

async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

// Each test compiles the page with the real compiler and imports the skin: seconds, more under a parallel root run.
describe("compiled page integration (ComponentsDemo)", { timeout: 30_000 }, () => {
  it("swaps the alert branch to the restore button after self-dismissal", async () => {
    const file = await compilePage();
    const { default: ComponentsDemo } = await import(/* @vite-ignore */ path.resolve(file));
    const renderer = new Renderer(services());
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderer.renderInContainer(ComponentsDemo, container);
    await settle(renderer);
    expect(container.querySelector(".alert")).not.toBeNull();

    container.querySelector(".btn-close")!.dispatchEvent(new Event("click", { bubbles: true }));
    await settle(renderer);

    const card = [...container.querySelectorAll(".card")].find((c) => c.textContent!.includes("Alert (dismissible)"))!;
    expect(card.querySelector("button")?.textContent).toContain("Show alert again");
    expect(card.querySelector(".alert")).toBeNull();
  });

  it("keeps all interactive components live after the swap (clicks still re-render)", async () => {
    const file = await compilePage();
    const { default: ComponentsDemo } = await import(/* @vite-ignore */ path.resolve(file));
    const renderer = new Renderer(services());
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderer.renderInContainer(ComponentsDemo, container);
    await settle(renderer);

    const countButtons = [...container.querySelectorAll("button")].filter((b) => b.textContent!.trim() === "Count");
    countButtons[0]!.dispatchEvent(new Event("click", { bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".badge")!.textContent).toBe("1");
  });
});