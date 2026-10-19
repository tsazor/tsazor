/**
 * `portal(element)`: an element the renderer rendered, moved to `document.body` (a popup escaping its container, as
 * Radzen's openPopup does) with a placeholder where it was. The renderer keeps addressing it: updates inside apply,
 * its siblings update, its removal (or an ancestor's) takes it along, events work, and the undo puts it back. Moved by
 * hand, the next update failed — the Radzen port's F333.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, EventCallback, portal, type RenderTreeBuilder } from "../src/index";
import { Renderer } from "../src/internal";

afterEach(() => {
  document.body.innerHTML = "";
});

class Popup extends ComponentBase {
  open = false;
  label = "a";
  showPopup = true;
  showSection = true;
  clicks = 0;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    if (!this.showSection) return;
    b.openElement(0, "section");
    b.openElement(1, "span");
    b.addContent(2, "before");
    b.closeElement();
    if (this.showPopup) {
      b.openElement(3, "div");
      b.addAttribute(4, "id", "pop");
      b.openElement(5, "input");
      b.addAttribute(6, "aria-expanded", String(this.open));
      b.closeElement();
      b.openElement(7, "button");
      b.addAttribute(8, "onclick", EventCallback.bind(this, () => this.clicks++));
      b.addContent(9, `clicked ${this.clicks}`);
      b.closeElement();
      b.addContent(10, this.label);
      b.closeElement();
    }
    b.openElement(11, "span");
    b.addAttribute(12, "id", "after");
    b.addContent(13, this.label);
    b.closeElement();
    b.closeElement();
  }
  set(changes: Partial<Pick<Popup, "open" | "label" | "showPopup" | "showSection">>): void {
    Object.assign(this, changes);
    this.stateHasChanged();
  }
}

async function mount(): Promise<{ renderer: Renderer; component: Popup; errors: unknown[] }> {
  const container = document.createElement("div");
  container.id = "app";
  document.body.appendChild(container);
  const renderer = new Renderer();
  const errors: unknown[] = [];
  renderer.errorHandler = (error) => errors.push(error.error);
  const state = renderer.renderInContainer(Popup, container);
  await renderer.waitUntilIdle();
  return { renderer, component: state.component as Popup, errors };
}

const pop = () => document.getElementById("pop");

describe("portal", () => {
  it("keeps the moved element in the render: updates inside and beside it apply, events work", async () => {
    const { renderer, component, errors } = await mount();
    portal(pop()!);
    expect(pop()!.parentElement).toBe(document.body);
    component.set({ open: true, label: "b" });
    await renderer.waitUntilIdle();
    expect(errors).toEqual([]);
    expect(pop()!.querySelector("input")!.getAttribute("aria-expanded")).toBe("true");
    expect(pop()!.textContent).toContain("b");
    expect(document.getElementById("after")!.textContent).toBe("b");
    pop()!.querySelector("button")!.click();
    await renderer.waitUntilIdle();
    expect(pop()!.querySelector("button")!.textContent).toBe("clicked 1");
  });

  it("takes it along when the render removes it, or an ancestor of its place", async () => {
    const first = await mount();
    portal(pop()!);
    first.component.set({ showPopup: false });
    await first.renderer.waitUntilIdle();
    expect(pop()).toBeNull();
    expect(first.errors).toEqual([]);

    document.body.innerHTML = "";
    const second = await mount();
    portal(pop()!);
    second.component.set({ showSection: false });
    await second.renderer.waitUntilIdle();
    expect(pop()).toBeNull();
    expect(second.errors).toEqual([]);
  });

  it("puts it back on undo, where the render goes on addressing it", async () => {
    const { renderer, component, errors } = await mount();
    const undo = portal(pop()!, document.body);
    undo();
    expect(pop()!.parentElement!.tagName).toBe("SECTION");
    expect(document.querySelector("section")!.innerHTML).not.toContain("tsazor-portal");
    component.set({ label: "c" });
    await renderer.waitUntilIdle();
    expect(errors).toEqual([]);
    expect(pop()!.textContent).toContain("c");
  });
});
