/**
 * Conformance harness: compiles .tsazor snippets through the *real* plugin
 * pipeline (`transformTsazor` — _Imports chain, resolution, import inference,
 * esbuild) and mounts them in happy-dom with the real Renderer.
 *
 * Assertions are made on rendered DOM and diagnostics, never on generated code
 * text, so the suites survive the compiler rewrite (roadmap Track A) unchanged.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Renderer, type ComponentBase } from "@tsazor/runtime";
import type { TszDiagnostic } from "@tsazor/compiler";
import { transformTsazor } from "../../vite-plugin/src/transform.js";
import { takeEscapedRenderErrors } from "./setup.js";

const here = path.dirname(fileURLToPath(new URL(import.meta.url)));
let caseCounter = 0;

export type Files = Record<string, string>;

export interface CompiledCase {
  dir: string;
  /** Diagnostics per file name (e.g. "Test.tsazor"). */
  diagnostics: Record<string, readonly TszDiagnostic[]>;
  /** Absolute path of the compiled JS module per .tsazor file. */
  modules: Record<string, string>;
}

/**
 * Writes the files into a fresh case directory and compiles every .tsazor.
 * Non-.tsazor files (.ts helpers, code-behind, css) are written verbatim.
 * `_Imports.tsazor` defaults to empty.
 */
export async function compileFiles(files: Files): Promise<CompiledCase> {
  const dir = path.resolve(here, ".build", `case-${process.pid}-${++caseCounter}`);
  await mkdir(dir, { recursive: true });
  const all: Files = { "_Imports.tsazor": "", ...files };
  for (const [name, content] of Object.entries(all)) {
    await mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await writeFile(path.join(dir, name), content);
  }
  const diagnostics: CompiledCase["diagnostics"] = {};
  const modules: CompiledCase["modules"] = {};
  for (const [name, content] of Object.entries(all)) {
    if (!name.endsWith(".tsazor") || path.basename(name) === "_Imports.tsazor") continue;
    const filePath = path.join(dir, name);
    const result = await transformTsazor(content, filePath, dir, { sourceMap: false, hmr: false });
    diagnostics[name] = result.diagnostics.all;
    // Sibling component imports point at the source (.tsazor); the harness
    // serves the compiled module next to it instead.
    const js = result.code.replace(/(["'])(\.{1,2}\/[^"']+?)\.tsazor\1/g, "$1$2.tsazor.mjs$1");
    const out = `${filePath}.mjs`;
    await writeFile(out, js);
    modules[name] = out;
  }
  return { dir, diagnostics, modules };
}

/** Diagnostics of a single-file snippet (compiled as Test.tsazor). */
export async function diagnosticsOf(source: string, extra: Files = {}): Promise<readonly TszDiagnostic[]> {
  const compiled = await compileFiles({ "Test.tsazor": source, ...extra });
  return compiled.diagnostics["Test.tsazor"] ?? [];
}

export interface Mounted<T extends ComponentBase = ComponentBase> {
  container: HTMLElement;
  renderer: Renderer;
  /** The root component instance (to mutate state in tests). */
  instance: T & Record<string, unknown>;
  diagnostics: readonly TszDiagnostic[];
  /** Normalized innerHTML: comment markers removed, whitespace collapsed. */
  html(): string;
  /** textContent with whitespace collapsed and trimmed. */
  text(): string;
  /** Waits for pending renders and handler work. */
  settle(): Promise<void>;
  /** Calls stateHasChanged on the root and settles. */
  rerender(): Promise<void>;
}

/**
 * Compiles and mounts `entry` (default "Test.tsazor"). A plain string is
 * shorthand for `{ "Test.tsazor": source }`. Throws when the entry has compile
 * errors, listing them — tests that expect a successful compile fail loudly.
 */
export async function mount<T extends ComponentBase = ComponentBase>(
  filesOrSource: Files | string,
  entry = "Test.tsazor",
): Promise<Mounted<T>> {
  const files = typeof filesOrSource === "string" ? { [entry]: filesOrSource } : filesOrSource;
  const compiled = await compileFiles(files);
  const errors = Object.entries(compiled.diagnostics).flatMap(([file, list]) =>
    list.filter((d) => d.severity === "error").map((d) => `${file}:${d.pos.line}:${d.pos.column} ${d.code} ${d.message}`),
  );
  if (errors.length > 0) throw new Error(`compile errors:\n${errors.join("\n")}`);

  const { default: Component } = await import(/* @vite-ignore */ compiled.modules[entry]!);
  const renderer = new Renderer();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const state = renderer.renderInContainer(Component, container);
  const settle = async (): Promise<void> => {
    await renderer.waitUntilIdle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await renderer.waitUntilIdle();
    rethrowEscapedRenderErrors();
  };
  await settle();
  const instance = state.component as T & Record<string, unknown>;
  return {
    container,
    renderer,
    instance,
    diagnostics: compiled.diagnostics[entry] ?? [],
    html: () => normalizeHtml(container.innerHTML),
    text: () => (container.textContent ?? "").replace(/\s+/g, " ").trim(),
    settle,
    rerender: async () => {
      (instance as unknown as { stateHasChanged(): void }).stateHasChanged();
      await settle();
    },
  };
}

/** Surfaces render exceptions (see setup.ts) as a failure of the current test. */
export function rethrowEscapedRenderErrors(): void {
  const errors = takeEscapedRenderErrors();
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, `${errors.length} render errors`);
}

export function normalizeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/>\s+/g, ">")
    .replace(/\s+</g, "<")
    .trim();
}

/** Error codes (severity "error") of a diagnostics list. */
export function errorCodes(diagnostics: readonly TszDiagnostic[]): string[] {
  return diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}
