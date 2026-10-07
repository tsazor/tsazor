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
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CultureService,
  HeadOutlet,
  MemoryHistory,
  NavigationManager,
  Renderer,
  RouteManifest,
  ServiceCollection,
  StringLocalizer,
  type ComponentBase,
  type ComponentState,
  type RenderError,
  type RouteEntry,
  type TsazorAppOptions,
  type Token,
} from "@tsazor/testing";
import { MODULE_PREFIX, type ProjectBuild } from "../src/engine/compile-project";
import { run, type TestResult } from "../src/preview/mini-test";

/** "vitest" in a lesson's test file is the preview's runner — here too (the one module instance whose `run` is above). */
const MINI_TEST = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/preview/mini-test.ts")).href;

/** Stands in for @tsazor/runtime in Program.ts: records the app options instead of starting. */
const SHIM = `export * from "@tsazor/runtime";
export function createTsazorApp(options) {
    globalThis.__tsazorGateApp = options;
    return { dispose() {} };
}
`;

/** Writes the modules as files; module ids become relative file imports. */
/**
 * @tsazor/worker in the gate: Node has no Web Worker, so a worker module
 * runs in-process over a MessageChannel — loaded with @tsazor/worker's host
 * scope set (WORKER_SCOPE), once per worker (a query string makes each its
 * own module instance). Cloning, callbacks and cancellation behave as in a
 * browser; only the thread is the same.
 */
const WORKER_SCOPE = Symbol.for("tsazor.worker.scope");
let workerLoads: Promise<void> = Promise.resolve();
let workerCount = 0;
class GateWorker {
  private readonly port: MessagePort;
  constructor(url: string | URL) {
    const channel = new MessageChannel();
    this.port = channel.port1;
    const scope = {
      postMessage: (message: unknown, transfer?: Transferable[]) => channel.port2.postMessage(message, transfer ?? []),
      addEventListener: (type: string, listener: EventListener) => channel.port2.addEventListener(type, listener),
    };
    workerLoads = workerLoads.then(async () => {
      (globalThis as Record<symbol, unknown>)[WORKER_SCOPE] = scope;
      try {
        await import(`${String(url)}?worker=${++workerCount}`);
      } finally {
        delete (globalThis as Record<symbol, unknown>)[WORKER_SCOPE];
      }
      channel.port2.start();
    });
    channel.port1.start();
  }
  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.port.postMessage(message, transfer ?? []);
  }
  addEventListener(type: string, listener: EventListener): void {
    if (type === "message") this.port.addEventListener("message", listener);
  }
  terminate(): void {
    this.port.close();
  }
}
(globalThis as Record<string, unknown>).Worker = GateWorker;
(globalThis as Record<string, unknown>).__tsazorWorkerUrl = (url: string) => url;

export function writeModules(build: ProjectBuild, dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const module of Object.values(build.modules)) {
    const fileDir = path.posix.dirname(module.file);
    const relative = (target: string): string => {
      const rel = path.posix.relative(fileDir === "." ? "" : fileDir, target);
      return rel.startsWith(".") ? rel : `./${rel}`;
    };
    // A worker module's URL: absolute (the GateWorker below imports it).
    let code = module.code.replace(/__tsazorWorkerUrl\((["'])\$app\/([^"']+)\1\)/g, (_match, _quote: string, target: string) =>
      `__tsazorWorkerUrl(${JSON.stringify(pathToFileURL(path.join(dir, `${target}.js`)).href)})`,
    );
    code = code.replace(/(["'])\$app\/([^"']+)\1/g, (_match, quote: string, target: string) => `${quote}${relative(target)}.js${quote}`);
    code = code.replace(/(["'])vitest\1/g, JSON.stringify(MINI_TEST));
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
  /** A Program.ts may pass its own routes (as createTsazorApp's `routes` option). */
  let programRoutes: RouteEntry[] | undefined;
  /** A Program.ts may choose the routing mode (`routing: { mode: "hash" }`). */
  let routingMode: "history" | "hash" | undefined;
  /** A Program.ts may configure localization (culture + tables). */
  let localization: TsazorAppOptions["localization"];
  if (build.program) {
    const globals = globalThis as { __tsazorGateApp?: TsazorAppOptions };
    delete globals.__tsazorGateApp;
    await load(build.program);
    const options = globals.__tsazorGateApp;
    if (!options) throw new Error("Program.ts did not call createTsazorApp");
    root = options.root;
    services = options.services;
    programRoutes = options.routes as RouteEntry[] | undefined;
    routingMode = options.routing?.mode;
    localization = options.localization;
  } else {
    root = (await load(build.entry!)).default as TsazorAppOptions["root"];
  }

  // As createTsazorApp: the @page routes (a routing project's manifest), an
  // in-memory NavigationManager (the gate has no URL bar either), the app's
  // registrations, one renderer, two roots.
  const collection = new ServiceCollection();
  const history = new MemoryHistory(document.baseURI);
  const navigation = new NavigationManager({ mode: routingMode, history, location: history });
  collection.registerValue(NavigationManager as unknown as Token<NavigationManager>, navigation);
  const routes = programRoutes ?? [];
  if (routes.length === 0) {
    for (const request of build.routes) {
      const page = await load(request.module);
      const entry: RouteEntry = { template: request.template, type: page.default as RouteEntry["type"] };
      if (request.layout) entry.layout = (await load(request.layout)).default as RouteEntry["layout"];
      if (request.authorize) entry.authorize = request.authorize;
      routes.push(entry);
    }
  }
  if (routes.length > 0) {
    collection.registerValue(RouteManifest as unknown as Token<RouteManifest>, new RouteManifest(routes));
  }
  // E8, as createTsazorApp: a CultureService and a StringLocalizer always exist.
  const culture = new CultureService(localization?.defaultCulture ?? "");
  collection.registerValue(CultureService as unknown as Token<CultureService>, culture);
  collection.register(
    StringLocalizer as unknown as Token<StringLocalizer>,
    () => new StringLocalizer({ culture, tables: localization?.tables, defaultCulture: localization?.defaultCulture }),
  );
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

/** Runs a written build's test files (*.test.ts) with the preview's runner, as the preview does. */
export async function runWrittenTests(build: ProjectBuild, dir: string): Promise<TestResult[]> {
  for (const module of Object.values(build.modules)) {
    if (module.file.endsWith(".test.ts")) await import(pathToFileURL(path.join(dir, `${module.file}.js`)).href);
  }
  return run();
}
