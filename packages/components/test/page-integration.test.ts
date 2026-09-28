/**
 * End-to-end integration: compiles a real demo page (.tazor) through the same
 * 2-pass pipeline as the vite plugin, evaluates the module and mounts it in
 * happy-dom. Guards the full compiler → runtime → DOM path against
 * regressions that hand-built render trees cannot catch (e.g. the Razor
 * method-group conversion for event parameters — a bare `this.handler` used
 * to be invoked with the wrong receiver, so the owning page never re-rendered).
 */
import { describe, expect, it } from "vitest";
import { compile } from "@tasor/compiler";
import { collectCodeImports, collectImports, createFileContext } from "@tasor/workspace";
import { transformSync } from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Renderer } from "@tasor/runtime";

const pagePath = path.resolve("../../apps/demo/src/Pages/ComponentsDemo.tazor");
const root = path.resolve("../../apps/demo");

/** Same pipeline as the vite plugin / library build: 2-pass compile + esbuild. */
async function compilePage(): Promise<string> {
  const source = await readFile(pagePath, "utf8");
  const chain = await collectImports(path.dirname(pagePath), root);
  const context = createFileContext(pagePath, chain);
  const options = {
    className: "ComponentsDemo",
    fileName: pagePath,
    resolveComponent: (tag: string) => context.resolveComponent(tag, []),
    resolveType: (name: string) => context.resolveType(name, []),
    generateSourceMap: false,
  };
  const extra = collectCodeImports(source, compile(source, options).code, context);
  const compiled = compile(source, { ...options, imports: extra });
  const js = transformSync(compiled.code, {
    loader: "ts",
    sourcefile: pagePath,
    tsconfigRaw: { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false, target: "es2022" } },
  }).code;
  await mkdir(".build", { recursive: true });
  const out = path.resolve(".build/ComponentsDemo.page.mjs");
  await writeFile(out, js);
  return out;
}

async function settle(renderer: Renderer): Promise<void> {
  await renderer.waitUntilIdle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.waitUntilIdle();
}

describe("compiled page integration (ComponentsDemo)", () => {
  it("swaps the alert branch to the restore button after self-dismissal", async () => {
    const file = await compilePage();
    const { default: ComponentsDemo } = await import(/* @vite-ignore */ path.resolve(file));
    const renderer = new Renderer();
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderer.renderInContainer(ComponentsDemo, container);
    await settle(renderer);
    expect(container.querySelector(".alert")).not.toBeNull();

    container.querySelector(".btn-close")!.dispatchEvent(new Event("click", { bubbles: true }));
    await settle(renderer);

    const card = [...container.querySelectorAll(".card")].find((c) => c.textContent!.includes("Alert (dismissible)"))!;
    expect(card.querySelector("button")?.textContent).toContain("Alert wieder zeigen");
    expect(card.querySelector(".alert")).toBeNull();
  });

  it("keeps all interactive components live after the swap (clicks still re-render)", async () => {
    const file = await compilePage();
    const { default: ComponentsDemo } = await import(/* @vite-ignore */ path.resolve(file));
    const renderer = new Renderer();
    const container = document.createElement("div");
    document.body.appendChild(container);
    renderer.renderInContainer(ComponentsDemo, container);
    await settle(renderer);

    const countButtons = [...container.querySelectorAll("button")].filter((b) => b.textContent!.trim() === "Zählen");
    countButtons[0]!.dispatchEvent(new Event("click", { bubbles: true }));
    await settle(renderer);
    expect(container.querySelector(".badge")!.textContent).toBe("1");
  });
});