/**
 * SSR spike, part 1: the real runtime (Renderer + DomRenderer) renders the compiled app into a server-side DOM
 * (happy-dom) and the HTML is read off it. Shows which browser globals the runtime touches when it renders, and what
 * a render costs.
 *
 *   node spikes/ssr/build.mjs && node spikes/ssr/render-dom.mjs
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const require = createRequire(path.join(repo, "packages", "testing", "package.json"));
const { Window } = require("happy-dom");

// A server-side window; the runtime's globals are installed one by one, and every one it reads is logged.
const window = new Window({ url: "https://bakery.example/" });
const touched = new Set();
for (const name of ["window", "document", "Node", "Element", "HTMLElement", "Text", "Comment", "DocumentFragment", "Event", "location", "history", "navigator"]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      touched.add(name);
      return name === "window" ? window : window[name];
    },
  });
}

const { Renderer } = await import(pathToFileURL(path.join(repo, "packages", "runtime", "dist", "index.js")).href);
const { default: App } = await import(pathToFileURL(path.join(here, ".build", "App.tsazor.mjs")).href);

const render = async () => {
  const container = window.document.createElement("div");
  const renderer = new Renderer();
  renderer.renderInContainer(App, container);
  await renderer.waitUntilIdle();
  return container.innerHTML;
};

const first = performance.now();
const html = await render();
const firstMs = performance.now() - first;
const runs = 200;
const start = performance.now();
for (let i = 0; i < runs; i++) await render();
const eachMs = (performance.now() - start) / runs;

console.log(html);
console.log(`\nfirst render ${firstMs.toFixed(1)} ms, then ${eachMs.toFixed(2)} ms per render (${runs} runs)`);
console.log(`globals read: ${[...touched].sort().join(", ")}`);
console.log(`comment markers in the HTML: ${(html.match(/<!--/g) ?? []).length}`);
