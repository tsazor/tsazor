/**
 * Runs a lesson build headlessly the way the preview runs it: the modules
 * are written as files (module ids → relative imports), and the app starts
 * like `createTsazorApp` starts it — one renderer with a `HeadOutlet` root in
 * `document.head` (PageTitle/HeadContent) next to the app's root. A lesson
 * with a `Program.ts` starts itself: its `createTsazorApp` call is captured
 * (the gate's runtime shim) and replayed here with its `root` and `services`.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  HeadOutlet,
  NavigationManager,
  Renderer,
  ServiceCollection,
  type ComponentBase,
  type ComponentState,
  type RenderError,
  type TsazorAppOptions,
  type Token,
} from "@tsazor/testing";
import { MODULE_PREFIX, type ProjectBuild } from "../src/engine/compile-project";

/** Stands in for @tsazor/runtime in Program.ts: records the app options instead of starting. */
const SHIM = `export * from "@tsazor/runtime";
export function createTsazorApp(options) {
    globalThis.__tsazorGateApp = options;
    return { dispose() {} };
}
`;

/** Writes the modules as files; module ids become relative file imports. */
export function writeModules(build: ProjectBuild, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const module of Object.values(build.modules)) {
    const fileDir = path.posix.dirname(module.file);
    const relative = (target: string): string => {
      const rel = path.posix.relative(fileDir === "." ? "" : fileDir, target);
      return rel.startsWith(".") ? rel : `./${rel}`;
    };
    let code = module.code.replace(/(["'])\$app\/([^"']+)\1/g, (_match, quote: string, target: string) => `${quote}${relative(target)}.js${quote}`);
    if (build.program && module.id === build.program) {
      code = code.replace(/(["'])@tsazor\/runtime\1/g, `$1${relative("__gate-runtime.mjs")}$1`);
    }
    const out = path.join(dir, `${module.file}.js`);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, code);
  }
  if (build.program) writeFileSync(path.join(dir, "__gate-runtime.mjs"), SHIM);
}

export interface Mounted {
  container: HTMLElement;
  renderer: Renderer;
  instance: ComponentBase & Record<string, unknown>;
  /** Markup without the renderer's boundary comments and scope attributes. */
  html(): string;
  /** Lets timers and promises run, then waits for the renderer. */
  settle(ms?: number): Promise<void>;
  dispose(): void;
}

/** Imports the build's entry (or Program.ts) from `dir` and mounts it with a head outlet. */
export async function mountWritten(build: ProjectBuild, dir: string, options: { onError?: (error: RenderError) => void } = {}): Promise<Mounted> {
  const load = async (id: string): Promise<Record<string, unknown>> =>
    (await import(pathToFileURL(path.join(dir, `${id.slice(MODULE_PREFIX.length)}.js`)).href)) as Record<string, unknown>;
  let root: TsazorAppOptions["root"];
  let services: TsazorAppOptions["services"];
  if (build.program) {
    const globals = globalThis as { __tsazorGateApp?: TsazorAppOptions };
    delete globals.__tsazorGateApp;
    await load(build.program);
    const options = globals.__tsazorGateApp;
    if (!options) throw new Error("Program.ts did not call createTsazorApp");
    root = options.root;
    services = options.services;
  } else {
    root = (await load(build.entry!)).default as TsazorAppOptions["root"];
  }

  // As createTsazorApp: a NavigationManager, the app's registrations, one renderer, two roots.
  const collection = new ServiceCollection();
  const navigation = new NavigationManager();
  collection.registerValue(NavigationManager as unknown as Token<NavigationManager>, navigation);
  services?.(collection);
  const renderer = new Renderer(collection.build());
  if (options.onError) renderer.errorHandler = options.onError;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const head: ComponentState = renderer.renderInContainer(HeadOutlet, document.head);
  const state: ComponentState = renderer.renderInContainer(root, container);
  await renderer.waitUntilIdle();
  let disposed = false;
  return {
    container,
    renderer,
    instance: state.component as ComponentBase & Record<string, unknown>,
    html: () => container.innerHTML.replace(/<!--\/?bl-tsazor:[^>]*-->/g, "").replace(/\s+b-[0-9a-f]{8}=""/g, ""),
    settle: async (ms = 0) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      await renderer.waitUntilIdle();
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      renderer.disposeComponent(head);
      head.range.remove();
      renderer.disposeComponent(state);
      state.range.remove();
      container.remove();
      navigation.dispose();
    },
  };
}

/** The preview document's head as the app left it: the title and the outlet's content. */
export function headSnapshot(): string {
  return `title:${document.title}|${document.head.innerHTML.replace(/<!--\/?bl-tsazor:[^>]*-->/g, "")}`;
}
