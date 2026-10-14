/**
 * An attribute name that carries an inline handler string in one render and
 * an event handler in another (`onclick="alert(1)"` ⇄ `@onclick="handler"`):
 * the string is removed when a handler takes over, also after the element
 * had a handler before, and a replaced handler is the one that runs.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ComponentBase, ServiceCollection } from "../src/index";
import { Renderer } from "../src/internal";
import type { RenderTreeBuilder } from "../src/index";

type Mode = { kind: "string"; text: string } | { kind: "handler"; run: () => void };

let mode: Mode = { kind: "string", text: "void 0" };
let instance: Probe | undefined;

class Probe extends ComponentBase {
  override onInitialized(): void {
    instance = this;
  }

  refresh(): void {
    this.stateHasChanged();
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "button");
    if (mode.kind === "string") b.addAttribute(1, "onclick", mode.text);
    else b.addAttribute(1, "onclick", mode.run);
    b.addContent(2, "go");
    b.closeElement();
  }
}

afterEach(() => {
  document.body.innerHTML = "";
  instance = undefined;
});

async function mount(): Promise<{ renderer: Renderer; button: () => HTMLButtonElement }> {
  const renderer = new Renderer(new ServiceCollection().build());
  const host = document.createElement("div");
  document.body.appendChild(host);
  renderer.renderInContainer(Probe, host);
  await renderer.waitUntilIdle();
  return { renderer, button: () => host.querySelector("button")! };
}

async function switchTo(renderer: Renderer, next: Mode): Promise<void> {
  mode = next;
  instance!.refresh();
  await renderer.waitUntilIdle();
}

describe("inline handler strings and event handlers under one name", () => {
  it("string → handler → handler → string → handler", async () => {
    mode = { kind: "string", text: "void 0" };
    const { renderer, button } = await mount();
    expect(button().getAttribute("onclick")).toBe("void 0");

    const calls: string[] = [];
    await switchTo(renderer, { kind: "handler", run: () => calls.push("first") });
    expect(button().hasAttribute("onclick")).toBe(false);
    button().click();

    await switchTo(renderer, { kind: "handler", run: () => calls.push("second") });
    expect(button().hasAttribute("onclick")).toBe(false);
    button().click();
    expect(calls).toEqual(["first", "second"]);

    await switchTo(renderer, { kind: "string", text: "void 1" });
    expect(button().getAttribute("onclick")).toBe("void 1");
    button().click();
    expect(calls).toEqual(["first", "second"]);

    await switchTo(renderer, { kind: "handler", run: () => calls.push("third") });
    expect(button().hasAttribute("onclick")).toBe(false);
    button().click();
    expect(calls).toEqual(["first", "second", "third"]);
  });
});
