/**
 * The live preview: every build runs in a fresh sandboxed iframe
 * (`allow-scripts` only — an opaque origin, no access to the tutorial page).
 *
 * The parent posts the compiled modules and the prebuilt runtime/components
 * bundles; the iframe turns each into a blob URL (blob URLs are origin-bound,
 * so they must be created inside the opaque origin), installs an import map
 * (`@tsazor/runtime`, `@tsazor/components`, `$app/…`), injects the CSS and
 * mounts `App` with createTsazorApp — or imports the lesson's `Program.ts`,
 * which starts the app itself (with its services; a runtime shim adds the
 * routes and the History below). A routing project gets
 * its `@page` manifest as the app's routes and an in-memory History (a srcdoc
 * document has no usable history API). Errors, console output, the document
 * title (PageTitle) and the current URL come back via postMessage; stack
 * positions are mapped to the original files with the modules' source maps.
 */
import { originalPosition, type CompiledModule, type ProjectBuild } from "../engine/types.js";

export interface PreviewMessage {
  kind: "error" | "warn" | "log";
  text: string;
}

export interface PreviewCallbacks {
  /** The app mounted (or failed to). */
  onStatus(status: "running" | "ready" | "failed"): void;
  onMessage(message: PreviewMessage): void;
  /** The visible app's document title changed (`<PageTitle>`; "" without one). */
  onTitle?(title: string): void;
  /** The app's (logical) URL changed and after mount — routing lessons only. */
  onUrl?(url: string): void;
}

interface Bundles {
  runtime: string;
  components: string;
  dotnet: string;
}

let bundles: Promise<Bundles> | undefined;
const loadBundles = (): Promise<Bundles> =>
  (bundles ??= import("virtual:tutorial-bundles").then((module) => ({ runtime: module.runtime, components: module.components, dotnet: module.dotnet })));

const PREVIEW_STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; padding: 16px 20px; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; line-height: 1.5; color: #1f2328; background: #fff; }
  h1 { font-size: 2em; margin: 0.3em 0 0.5em; }
  img { max-width: 100%; }
  button { font: inherit; }
`;

/** The iframe document: a classic bootstrap script that waits for the "run" message. */
function srcdoc(baseHref: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<base href="${baseHref}">
<style>${PREVIEW_STYLE}</style>
<style id="tsazor-app-css"></style>
<script>
(() => {
  const send = (message) => parent.postMessage({ source: "tsazor-preview", ...message }, "*");
  const show = (value) => {
    if (value instanceof Error) return value.stack || String(value);
    if (typeof value === "string") return value;
    try { return JSON.stringify(value); } catch { return String(value); }
  };
  addEventListener("error", (event) => {
    send({ type: "error", text: event.error && event.error.stack ? event.error.stack : String(event.message) });
  });
  addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    send({ type: "error", text: reason && reason.stack ? reason.stack : "Unhandled rejection: " + show(reason) });
  });
  for (const level of ["log", "info", "warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      send({ type: level === "info" ? "log" : level, text: args.map(show).join(" ") });
    };
  }
  addEventListener("message", (event) => {
    if (event.source !== parent || !event.data || event.data.type !== "run") return;
    const { modules, runtime, components, dotnet, css, entry, program, routes } = event.data;
    const url = (code) => URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const imports = { "@tsazor/runtime": url(runtime), "@tsazor/components": url(components), "@tsazor/dotnet": url(dotnet) };
    // A Program.ts starts the app itself, but it cannot know the preview's
    // routes or its in-memory History: its @tsazor/runtime import goes to a
    // shim whose createTsazorApp adds both (unless the program passes its own).
    const programShim = program && url(
      'import { createTsazorApp as start, MemoryHistory, NavigationManager } from "@tsazor/runtime";\\n' +
      'export * from "@tsazor/runtime";\\n' +
      "const routes = [];\\n" +
      "for (const request of " + JSON.stringify(routes) + ") {\\n" +
      "  const page = await import(request.module);\\n" +
      "  const route = { template: request.template, type: page.default };\\n" +
      "  if (request.layout) route.layout = (await import(request.layout)).default;\\n" +
      "  if (request.authorize) route.authorize = request.authorize;\\n" +
      "  routes.push(route);\\n" +
      "}\\n" +
      "export function createTsazorApp(options) {\\n" +
      "  const history = new MemoryHistory(document.baseURI);\\n" +
      "  const navigation = options.navigationManager ?? new NavigationManager({ history, location: history });\\n" +
      "  const app = start({ ...options, routes: options.routes ?? (routes.length > 0 ? routes : undefined), navigationManager: navigation });\\n" +
      "  const post = () => parent.postMessage({ source: \\"tsazor-preview\\", type: \\"url\\", text: history.href }, \\"*\\");\\n" +
      "  if (!options.navigationManager) { navigation.addLocationChanged(post); post(); }\\n" +
      "  return app;\\n" +
      "}\\n");
    const urls = {};
    for (const module of modules) {
      const code = module.id === program ? module.code.replace(/(["'])@tsazor\\/runtime\\1/g, JSON.stringify(programShim)) : module.code;
      imports[module.id] = url(code + "\\n//# sourceURL=" + module.id);
      urls[imports[module.id]] = module.id;
    }
    send({ type: "urls", urls });
    const map = document.createElement("script");
    map.type = "importmap";
    map.textContent = JSON.stringify({ imports });
    document.head.appendChild(map);
    document.getElementById("tsazor-app-css").textContent = css;
    const boot = document.createElement("script");
    boot.type = "module";
    // A Program.ts starts the app itself (and registers its services; the
    // shim above adds routes and History); otherwise the entry component is
    // mounted directly. Either way the app gets its routes (the @page
    // manifest) and — in a srcdoc document history.pushState throws — an
    // in-memory History, whose URL is reported like a browser address bar (H.7).
    if (program) {
      boot.textContent = "import " + JSON.stringify(program) + ";\\n" +
        'parent.postMessage({ source: "tsazor-preview", type: "ready" }, "*");';
    } else {
      const body =
        'import { createTsazorApp, MemoryHistory, NavigationManager } from "@tsazor/runtime";\\n' +
        "import App from " + JSON.stringify(entry) + ";\\n" +
        "const post = (message) => parent.postMessage({ source: \\"tsazor-preview\\", ...message }, \\"*\\");\\n" +
        "const routes = [];\\n" +
        "for (const request of " + JSON.stringify(routes) + ") {\\n" +
        "  const page = await import(request.module);\\n" +
        "  const route = { template: request.template, type: page.default };\\n" +
        "  if (request.layout) route.layout = (await import(request.layout)).default;\\n" +
        "  if (request.authorize) route.authorize = request.authorize;\\n" +
        "  routes.push(route);\\n" +
        "}\\n" +
        "const history = new MemoryHistory(document.baseURI);\\n" +
        "const navigation = new NavigationManager({ history, location: history });\\n" +
        "createTsazorApp({ root: App, routes, navigationManager: navigation });\\n" +
        "navigation.addLocationChanged(() => post({ type: \\"url\\", text: history.href }));\\n" +
        "post({ type: \\"url\\", text: history.href });\\n";
      boot.textContent = body + 'parent.postMessage({ source: "tsazor-preview", type: "ready" }, "*");';
    }
    document.body.appendChild(boot);
  });
  // The document title (PageTitle) is shown in the preview bar, like a tab.
  let title = null;
  const reportTitle = () => {
    if (document.title === title) return;
    title = document.title;
    send({ type: "title", text: title });
  };
  new MutationObserver(reportTitle).observe(document.head, { childList: true, subtree: true, characterData: true });
  send({ type: "loaded" });
})();
</script>
</head>
<body><div id="app"></div></body>
</html>`;
}

export class PreviewHost {
  private frame: HTMLIFrameElement | undefined;
  private pending: HTMLIFrameElement | undefined;
  private modulesById = new Map<string, CompiledModule>();
  private idsByUrl: Record<string, string> = {};
  private readonly titles = new WeakMap<HTMLIFrameElement, string>();
  private readonly urls = new WeakMap<HTMLIFrameElement, string>();
  private run = 0;
  private readonly listener = (event: MessageEvent): void => this.handleMessage(event);

  constructor(private readonly container: HTMLElement, private readonly callbacks: PreviewCallbacks) {
    window.addEventListener("message", this.listener);
  }

  /** Runs a build in a fresh iframe; the old one stays visible until the new one is up. */
  async show(build: ProjectBuild): Promise<void> {
    const run = ++this.run;
    const { runtime, components, dotnet } = await loadBundles();
    if (run !== this.run || !build.entry) return;
    this.pending?.remove();
    const frame = document.createElement("iframe");
    frame.title = "Preview";
    frame.className = "preview-frame preview-frame--pending";
    // allow-forms: without it the browser drops a form submission before the
    // submit event fires, so EditForm would never see it. (EditForm cancels
    // the navigation itself; the frame stays without allow-same-origin.)
    frame.setAttribute("sandbox", "allow-scripts allow-modals allow-forms");
    frame.srcdoc = srcdoc(new URL(import.meta.env.BASE_URL, location.href).href);
    this.pending = frame;
    this.modulesById = new Map(Object.values(build.modules).map((module) => [module.id, module]));
    this.idsByUrl = {};
    const payload = {
      type: "run",
      modules: Object.values(build.modules).map(({ id, code }) => ({ id, code })),
      runtime,
      components,
      dotnet,
      css: build.css,
      entry: build.entry,
      program: build.program,
      routes: build.routes,
    };
    (frame as HTMLIFrameElement & { __payload?: unknown }).__payload = payload;
    this.callbacks.onStatus("running");
    this.container.appendChild(frame);
    // Swap even if the app never reports back (an import error, an endless loop).
    setTimeout(() => {
      if (this.pending === frame) this.promote(frame);
    }, 1500);
  }

  private promote(frame: HTMLIFrameElement): void {
    if (this.frame && this.frame !== frame) this.frame.remove();
    this.frame = frame;
    if (this.pending === frame) this.pending = undefined;
    frame.classList.remove("preview-frame--pending");
    this.callbacks.onTitle?.(this.titles.get(frame) ?? "");
    const url = this.urls.get(frame);
    if (url !== undefined) this.callbacks.onUrl?.(url);
  }

  private handleMessage(event: MessageEvent): void {
    const data = event.data as { source?: string; type?: string; text?: string; urls?: Record<string, string> } | null;
    if (!data || data.source !== "tsazor-preview") return;
    const frame = [this.pending, this.frame].find((candidate) => candidate?.contentWindow === event.source);
    if (!frame) return;
    switch (data.type) {
      case "loaded": {
        const payload = (frame as HTMLIFrameElement & { __payload?: unknown }).__payload;
        frame.contentWindow!.postMessage(payload, "*");
        break;
      }
      case "title":
        this.titles.set(frame, data.text ?? "");
        if (frame === this.frame) this.callbacks.onTitle?.(data.text ?? "");
        break;
      case "url":
        this.urls.set(frame, data.text ?? "");
        if (frame === this.frame) this.callbacks.onUrl?.(data.text ?? "");
        break;
      case "urls":
        this.idsByUrl = data.urls ?? {};
        break;
      case "ready":
        this.promote(frame);
        this.callbacks.onStatus("ready");
        break;
      case "error":
        if (frame === this.pending) this.promote(frame);
        this.callbacks.onStatus("failed");
        this.callbacks.onMessage({ kind: "error", text: this.mapStack(data.text ?? "") });
        break;
      case "warn":
      case "log":
        this.callbacks.onMessage({ kind: data.type, text: this.mapStack(data.text ?? "") });
        break;
    }
  }

  /** `blob:…:12:5` / `$app/App.tsazor:12:5` → `App.tsazor:3:9` (original position). */
  private mapStack(text: string): string {
    return text.replace(/(blob:[^\s)]+?|\$app\/[^\s):]+):(\d+):(\d+)/g, (match, location: string, line: string, column: string) => {
      const id = location.startsWith("blob:") ? this.idsByUrl[location] : location;
      const module = id ? this.modulesById.get(id) : undefined;
      if (!module) return match;
      const original = originalPosition(module, Number(line), Number(column) - 1);
      return original ? `${module.file}:${original.line}:${original.column + 1}` : `${module.file} (compiled):${line}:${column}`;
    });
  }

  dispose(): void {
    window.removeEventListener("message", this.listener);
    this.frame?.remove();
    this.pending?.remove();
  }
}
