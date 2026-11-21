// SSR spike, part 3a (SharpTS): the runtime's own RenderTreeBuilder (TypeScript source) on .NET — frames written as
// the compiler's buildRenderTree writes them, serialized to HTML by the same rules as render-string.mjs.
//
//   cd spikes/ssr && dotnet sharpts sharpts/frames.ts            (interpreter)
//   cd spikes/ssr && dotnet sharpts --compile sharpts/frames.ts  (to a .NET assembly)
import { RenderTreeBuilder, type RenderTreeFrame } from "../.build/runtime-src/render-tree/render-tree.js";

const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);
const escapeText = (value: unknown): string => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function serialize(frames: RenderTreeFrame[], start: number, end: number): string {
  let html = "";
  for (let i = start; i < end; ) {
    const frame = frames[i]!;
    if (frame.frameType === 1) {
      const close = i + frame.elementSubtreeLength!;
      let j = i + 1;
      let attributes = "";
      for (; j < close && frames[j]!.frameType === 3; j++) {
        const value = frames[j]!.attributeValue;
        if (typeof value === "string" || typeof value === "number") attributes += ` ${frames[j]!.attributeName}="${escapeText(value)}"`;
      }
      html += `<${frame.elementName}${attributes}>`;
      if (!VOID.has(frame.elementName!)) html += `${serialize(frames, j, close)}</${frame.elementName}>`;
      i = close;
    } else if (frame.frameType === 2) {
      html += escapeText(frame.textContent);
      i++;
    } else if (frame.frameType === 5) {
      html += serialize(frames, i + 1, i + frame.regionSubtreeLength!);
      i += frame.regionSubtreeLength!;
    } else {
      i++;
    }
  }
  return html;
}

// What App.tsazor's buildRenderTree writes for its list (compare .build/App.tsazor.mjs).
const basket = [{ id: 1, name: "Sourdough", price: 4.5 }, { id: 2, name: "Pretzel", price: 1.2 }];
const b = new RenderTreeBuilder();
b.openElement(0, "main");
b.addAttribute(1, "class", "shop");
b.openElement(2, "h1");
b.addContent(3, "Bakery");
b.closeElement();
b.openElement(4, "ul");
for (const item of basket) {
  b.openElement(5, "li");
  b.setKey(item.id);
  b.addAttribute(6, "class", item.price > 3 ? "dear" : null);
  b.addContent(7, `${item.name} — ${item.price.toFixed(2)} €`);
  b.closeElement();
}
b.closeElement();
b.addContent(8, (inner: RenderTreeBuilder) => {
  inner.openElement(0, "footer");
  inner.addContent(1, "Total: 5.70 €");
  inner.closeElement();
});
b.closeElement();

const frames = b.getFrames();
console.log(serialize(frames, 0, frames.length));
console.log(`${frames.length} frames`);
