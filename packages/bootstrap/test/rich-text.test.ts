/**
 * RichText (the external engine's wrapper) against a fake engine, driven the
 * way an app drives it (`@bind-Value` over a host): the factory builds on the
 * wrapper's area, the engine's DOM survives a re-render, the value flows two
 * ways (its echo writes nothing back, an outside value reaches the engine),
 * sanitize shapes on read, and the dispose destroys.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import { RichText } from "../dist/index.js";
import type { RichTextEditorContract } from "@tsazor/ui";

interface FakeEngine {
  contract: RichTextEditorContract;
  /** Fires the engine's change event. */
  change(html: string): void;
  /** How often setHTML ran (the loop guard's counter). */
  readonly sets: number;
  readonly destroyed: boolean;
}

/** A recording fake engine; its fake keeps the html as TEXT, so its paragraphs show it verbatim. */
function fakeEngine(element: HTMLElement): FakeEngine {
  const paragraph = document.createElement("p");
  paragraph.textContent = "engine dom";
  element.append(paragraph);
  let html = "";
  let changeHandler: ((data: { html: string }) => void) | undefined;
  let sets = 0;
  let destroyed = false;
  return {
    contract: {
      getHTML: () => html,
      setHTML: (value: string) => {
        sets++;
        html = value;
        paragraph.textContent = value;
      },
      on: (event: string, handler: (data: { html: string }) => void) => {
        if (event === "change") changeHandler = handler;
      },
      destroy: () => {
        destroyed = true;
        paragraph.remove();
      },
    },
    change: (value: string) => changeHandler!({ html: value }),
    get sets() {
      return sets;
    },
    get destroyed() {
      return destroyed;
    },
  };
}

class Factory {
  static engines: FakeEngine[] = [];
  static readonly build = (element: HTMLElement): RichTextEditorContract => {
    const engine = fakeEngine(element);
    Factory.engines.push(engine);
    return engine.contract;
  };
}

/** The host a real app is: it binds the value two-way (as `@bind-Value` does). */
class BoundHost extends ComponentBase {
  value: string | null = "<p>a</p>";
  /** The test sets the sanitize to hand the wrapper (as a caller would). */
  static sanitize?: (html: string) => string;
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openComponent(0, RichText as never);
    b.addAttribute(1, "create", Factory.build);
    b.addAttribute(2, "value", this.value ?? "");
    b.addAttribute(3, "valueChanged", EventCallback.unbound((next: string) => { this.value = next; }));
    if (BoundHost.sanitize !== undefined) b.addAttribute(4, "sanitize", BoundHost.sanitize);
    b.closeComponent();
  }
}

let mounted: Array<{ dispose(): void }> = [];
afterEach(() => {
  for (const result of mounted.splice(0)) result.dispose();
  document.body.innerHTML = "";
});

function lastEngine(): FakeEngine {
  return Factory.engines.at(-1)!;
}

describe("RichText", () => {
  it("mounts the engine on its area; the engine's DOM survives a re-render", async () => {
    Factory.engines = [];
    mounted.push(await render(RichText, { parameters: { create: Factory.build, value: "<p>start</p>" } }));
    const { instance, settle } = mounted.at(-1)!;
    await settle();
    expect(Factory.engines).toHaveLength(1);
    expect(lastEngine().destroyed).toBe(false);
    // The wrapper's area carries the engine's content (the html text in the fake).
    expect(document.querySelector(".tz-rich-text p")!.textContent).toBe("<p>start</p>");
    // A re-render leaves the engine's DOM where it is.
    (instance as unknown as { stateHasChanged(): void }).stateHasChanged();
    await settle();
    expect(document.querySelector(".tz-rich-text p")).not.toBeNull();
  });

  it("feeds the engine's changes into the bound value, sanitizing on read", async () => {
    Factory.engines = [];
    BoundHost.sanitize = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, "");
    mounted.push(await render(BoundHost));
    const { instance, settle } = mounted.at(-1)!;
    await settle();
    lastEngine().change("<p>Hi<script>a</script></p>");
    expect((instance as unknown as { value: string | null }).value).toBe("<p>Hi</p>");
    BoundHost.sanitize = undefined;
  });

  it("writes an outside value to the engine once; the engine's echo writes nothing back", async () => {
    Factory.engines = [];
    mounted.push(await render(BoundHost));
    const { instance, settle } = mounted.at(-1)!;
    await settle();
    const engine = lastEngine();
    expect(engine.sets).toBe(1);
    // The engine reports the same content: the echo writes nothing back.
    engine.change("<p>a</p>");
    expect(engine.sets).toBe(1);
    // An outside change reaches the engine (a parent re-render sets the value parameter).
    (instance as unknown as { value: string | null; stateHasChanged(): void }).value = "<p>b</p>";
    (instance as unknown as { stateHasChanged(): void }).stateHasChanged();
    await settle();
    expect(engine.sets).toBe(2);
    expect(document.querySelector(".tz-rich-text p")!.textContent).toBe("<p>b</p>");
  });

  it("starts empty and stays empty until the value or the engine says otherwise", async () => {
    Factory.engines = [];
    mounted.push(await render(RichText, { parameters: { create: Factory.build } }));
    const { settle } = mounted.at(-1)!;
    await settle();
    expect(lastEngine().sets).toBe(0);
    expect(document.querySelector(".tz-rich-text p")!.textContent).toBe("engine dom");
  });

  it("destroys the engine when the component goes away", async () => {
    Factory.engines = [];
    mounted.push(await render(RichText, { parameters: { create: Factory.build, value: "<p>x</p>" } }));
    const { dispose, settle } = mounted.at(-1)!;
    await settle();
    expect(lastEngine().destroyed).toBe(false);
    dispose();
    expect(lastEngine().destroyed).toBe(true);
    expect(document.querySelector(".tz-rich-text p")).toBeNull();
  });
});

describe("the bound host", () => {
  it("keeps the engine's value in the bound field across an engine change", async () => {
    Factory.engines = [];
    mounted.push(await render(BoundHost));
    const { instance, settle } = mounted.at(-1)!;
    await settle();
    lastEngine().change("<p>edited</p>");
    expect((instance as unknown as { value: string | null }).value).toBe("<p>edited</p>");
  });
});