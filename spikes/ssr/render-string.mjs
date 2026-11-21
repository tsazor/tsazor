/**
 * SSR spike, part 2: no DOM at all. A component's render tree (RenderTreeBuilder's frames) is serialized to HTML
 * directly, child components rendered on the way. The lifecycle is reduced to what a first, static render needs:
 * parameters assigned, onInitialized(Async) and onParametersSet(Async) awaited, buildRenderTree. Not handled: DI
 * (`inject` needs a service scope), cascading values, @ref, attachments — the parts a real server render mode of
 * the Renderer would bring.
 *
 *   node spikes/ssr/build.mjs && node spikes/ssr/render-string.mjs
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
if (typeof globalThis.document !== "undefined") throw new Error("this part runs without a DOM");

const { RenderTreeBuilder } = await import(pathToFileURL(path.join(repo, "packages", "runtime", "dist", "index.js")).href);
const { default: App } = await import(pathToFileURL(path.join(here, ".build", "App.tsazor.mjs")).href);

// FrameType (packages/runtime/src/render-tree/frame-type.ts, a const enum: inlined in the dist).
const Frame = { Element: 1, Text: 2, Attribute: 3, Component: 4, Region: 5, ElementRef: 6, Markup: 7, EventHandler: 8, ComponentRef: 9, Attachment: 10 };
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const escapeText = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttribute = (value) => escapeText(value).replace(/"/g, "&quot;");

/** Renders one component instance: its frames to HTML. */
async function renderComponent(type, parameters) {
  const component = new type();
  // Parameter names match case-insensitively, as the runtime's (a content block arrives as `ChildContent`); the
  // spike matches the instance's own fields — the runtime reads the @Parameter() metadata instead.
  const fields = new Map(Object.keys(component).map((key) => [key.toLowerCase(), key]));
  for (const [name, value] of parameters) component[fields.get(name.toLowerCase()) ?? name] = value;
  await component.onInitialized?.();
  await component.onInitializedAsync?.();
  await component.onParametersSet?.();
  await component.onParametersSetAsync?.();
  const builder = new RenderTreeBuilder();
  component.buildRenderTree(builder);
  const frames = builder.getFrames();
  return renderFrames(frames, 0, frames.length);
}

async function renderFrames(frames, start, end) {
  let html = "";
  for (let i = start; i < end; ) {
    const frame = frames[i];
    switch (frame.frameType) {
      case Frame.Element: {
        const close = i + frame.elementSubtreeLength;
        let j = i + 1;
        let attributes = "";
        // Its attribute run: plain values become attributes; handlers, attachments and captures are client work.
        for (; j < close && [Frame.Attribute, Frame.EventHandler, Frame.Attachment, Frame.ElementRef].includes(frames[j].frameType); j++) {
          const attribute = frames[j];
          if (attribute.frameType !== Frame.Attribute) continue;
          const value = attribute.attributeValue;
          if (value === false || value === null || value === undefined || typeof value === "function" || typeof value === "object") continue;
          attributes += value === true ? ` ${attribute.attributeName}` : ` ${attribute.attributeName}="${escapeAttribute(value)}"`;
        }
        const name = frame.elementName;
        html += `<${name}${attributes}>`;
        if (!VOID.has(name)) html += `${await renderFrames(frames, j, close)}</${name}>`;
        i = close;
        break;
      }
      case Frame.Text:
        html += escapeText(frame.textContent);
        i++;
        break;
      case Frame.Markup:
        html += frame.markupContent ?? "";
        i++;
        break;
      case Frame.Region:
        html += await renderFrames(frames, i + 1, i + frame.regionSubtreeLength);
        i += frame.regionSubtreeLength;
        break;
      case Frame.Component: {
        const close = i + frame.componentSubtreeLength;
        const parameters = new Map();
        for (let j = i + 1; j < close; j++) {
          if (frames[j].frameType === Frame.Attribute) parameters.set(frames[j].attributeName, frames[j].attributeValue);
        }
        html += await renderComponent(frame.componentType, parameters);
        i = close;
        break;
      }
      default:
        i++;
    }
  }
  return html;
}

const first = performance.now();
const html = await renderComponent(App, new Map());
const firstMs = performance.now() - first;
const runs = 2000;
const start = performance.now();
for (let i = 0; i < runs; i++) await renderComponent(App, new Map());
const eachMs = (performance.now() - start) / runs;
console.log(html);
console.log(`\nfirst render ${firstMs.toFixed(2)} ms, then ${(eachMs * 1000).toFixed(0)} µs per render (${runs} runs), no DOM`);
