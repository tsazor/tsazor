/**
 * E1: `createTsazorApp({ strictCsp: true })` writes style attributes through
 * the CSSOM (a strict style-src blocks setAttribute("style")); by default the
 * attribute keeps the text as written.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, createTsazorApp, type RenderTreeBuilder } from "../src/index";

class Styled extends ComponentBase {
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "p");
    b.addAttribute(1, "style", "color:red;width:10px");
    b.closeElement();
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

async function render(strictCsp: boolean | undefined): Promise<HTMLElement> {
  const root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(root);
  const app = createTsazorApp({ root: Styled, ...(strictCsp === undefined ? {} : { strictCsp }) });
  await app.renderer.waitUntilIdle();
  const p = root.querySelector("p")!;
  app.dispose();
  root.remove(); // the next app looks up #app again
  return p;
}

describe("strictCsp", () => {
  it("by default the style attribute keeps the text as written (setAttribute)", async () => {
    expect((await render(undefined)).getAttribute("style")).toBe("color:red;width:10px");
  });

  it("strictCsp writes it through the CSSOM: the same declarations, normalized text", async () => {
    const p = await render(true);
    expect(p.style.color).toBe("red");
    expect(p.style.width).toBe("10px");
    expect(p.getAttribute("style")).not.toBe("color:red;width:10px");
    expect(await render(false).then((q) => q.getAttribute("style"))).toBe("color:red;width:10px");
  });
});
