import { componentInternals } from "../src/components/component-internals";
/**
 * DOM applier (roadmap B3): the logical-range abstraction (insert, move,
 * remove, nesting, permutations), transactional application (a failed pass
 * leaves the DOM of the retained live tree) and the attribute/property rules
 * (review R10).
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, EventCallback, Parameter, defineComponent, type RenderTreeBuilder } from "../src/index";
import { Renderer, type RenderError } from "../src/internal";
import type { ComponentState } from "../src/renderer/component-state";
import { LogicalChildren, LogicalRange, lastNodeOf, removeLogicalChild } from "../src/renderer/logical-range";
import { DomJournal } from "../src/renderer/dom-journal";

type Build = (b: RenderTreeBuilder) => void;

/** Renders whatever its `build` function writes. */
class Fn extends ComponentBase {
  build: Build = () => {};
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.build(b);
  }
}

/** Renders `<i>label</i>` plus a markup block; logs its disposal. */
const disposed: string[] = [];
class Item extends ComponentBase {
  @Parameter() label = "";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.openElement(0, "i");
    b.addContent(1, this.label);
    b.closeElement();
    b.addMarkupContent(2, `<b>${this.label}</b>`);
  }
  dispose(): void {
    disposed.push(this.label);
  }
}

/** Renders a nested Item inside its own output: ranges within ranges. */
class Wrapper extends ComponentBase {
  @Parameter() label = "";
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.addContent(0, "[");
    b.openComponent(1, defineComponent(Item));
    b.addAttribute(2, "label", this.label);
    b.closeComponent();
    b.addContent(3, "]");
  }
}

async function mount(build: Build): Promise<{ container: HTMLElement; renderer: Renderer; state: ComponentState; errors: RenderError[]; update(next?: Build): Promise<void> }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const renderer = new Renderer();
  const errors: RenderError[] = [];
  renderer.errorHandler = (error) => errors.push(error);
  const state = renderer.renderInContainer(Fn, container);
  const component = state.component as Fn;
  component.build = build;
  componentInternals.requestRender(component);
  await renderer.waitUntilIdle();
  return {
    container,
    renderer,
    state,
    errors,
    async update(next?: Build) {
      if (next) component.build = next;
      componentInternals.requestRender(component);
      await renderer.waitUntilIdle();
    },
  };
}

const item = (b: RenderTreeBuilder, seq: number, label: string, key?: string): void => {
  b.openComponent(seq, defineComponent(Item));
  if (key !== undefined) b.setKey(key);
  b.addAttribute(seq + 1, "label", label);
  b.closeComponent();
};

/** Serializes a container including comments, so stray markers show up. */
function dump(node: Node): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === 8) out += `<!--${child.nodeValue}-->`;
    else if (child.nodeType === 3) out += child.nodeValue;
    else {
      const element = child as Element;
      const attributes = [...element.attributes].map((a) => ` ${a.name}="${a.value}"`).join("");
      out += `<${element.localName}${attributes}>${dump(element)}</${element.localName}>`;
    }
  });
  return out;
}

describe("LogicalRange", () => {
  function text(value: string): Text {
    return document.createTextNode(value);
  }

  it("inserts its markers, then its content moves and disappears with it", () => {
    const parent = document.createElement("div");
    parent.append(text("a"), text("z"));
    const range = new LogicalRange("r");
    range.insertBefore(parent, parent.lastChild);
    expect(range.parentNode).toBe(parent);
    expect(range.firstChild).toBeNull();
    parent.insertBefore(text("1"), range.end);
    parent.insertBefore(text("2"), range.end);
    expect(parent.textContent).toBe("a12z");
    expect(range.children().map((n) => (n as Node).textContent)).toEqual(["1", "2"]);
    expect(range.nodes()).toHaveLength(4);

    // Move as a unit to the end.
    range.insertBefore(parent, null);
    expect(parent.textContent).toBe("az12");
    expect(parent.lastChild).toBe(range.end);

    // Remove as a unit: nothing stays behind.
    const after = range.remove();
    expect(after).toBeNull();
    expect(dump(parent)).toBe("az");
    expect(range.parentNode).toBeNull();
  });

  it("nests: an inner range is one logical child of the outer one", () => {
    const parent = document.createElement("div");
    const outer = new LogicalRange("o");
    outer.insertBefore(parent, null);
    const inner = new LogicalRange("i");
    inner.insertBefore(parent, outer.end);
    parent.insertBefore(text("x"), inner.end);
    parent.insertBefore(text("y"), outer.end);

    expect(outer.children()).toEqual([inner, parent.childNodes[4]]);
    expect(LogicalRange.startingAt(inner.start)).toBe(inner);
    expect(lastNodeOf(inner.start)).toBe(inner.end);
    expect(new LogicalChildren(outer).list()).toEqual([inner.start, parent.childNodes[4]]);

    // Removing the inner range as a logical child takes its content along.
    expect(removeLogicalChild(inner.start, null)?.textContent).toBe("y");
    expect(dump(parent)).toBe("<!--o-->y<!--/o-->");
  });

  it("permutes node and range children as units", () => {
    const parent = document.createElement("div");
    const a = new LogicalRange("a");
    a.insertBefore(parent, null);
    parent.insertBefore(text("a1"), a.end);
    parent.insertBefore(text("a2"), a.end);
    parent.append(text("B"));
    const c = new LogicalRange("c");
    c.insertBefore(parent, null);
    parent.insertBefore(text("c1"), c.end);

    // [a, B, c] -> [c, a, B]
    new LogicalChildren(parent).permute([{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 0 }], null);
    expect(dump(parent)).toBe("<!--c-->c1<!--/c--><!--a-->a1a2<!--/a-->B");
  });

  it("journals structural changes so a rollback restores the exact DOM", () => {
    const parent = document.createElement("div");
    const range = new LogicalRange("r");
    range.insertBefore(parent, null);
    parent.insertBefore(text("1"), range.end);
    parent.append(text("B"));
    const nodes = [...parent.childNodes];
    const before = dump(parent);

    const journal = new DomJournal();
    new LogicalChildren(parent).permute([{ from: 0, to: 1 }, { from: 1, to: 0 }], journal);
    range.remove(journal);
    journal.property(parent.firstChild!, "nodeValue");
    parent.firstChild!.nodeValue = "changed";
    journal.attribute(parent, "title");
    parent.setAttribute("title", "t");
    expect(dump(parent)).not.toBe(before);

    journal.rollback();
    expect(dump(parent)).toBe(before);
    expect([...parent.childNodes]).toEqual(nodes);
    expect(parent.hasAttribute("title")).toBe(false);
  });
});

describe("applier — ranges in render passes", () => {
  it("keyed moves carry nested ranges (components in components, markup) as units", async () => {
    let order = ["a", "b", "c"];
    const h = await mount((b) => {
      for (const key of order) {
        b.openComponent(0, defineComponent(Wrapper));
        b.setKey(key);
        b.addAttribute(1, "label", key);
        b.closeComponent();
      }
    });
    expect(h.container.textContent).toBe("[aa][bb][cc]");
    order = ["c", "a", "b"];
    await h.update();
    expect(h.container.textContent).toBe("[cc][aa][bb]");
    order = ["b", "c"];
    await h.update();
    expect(h.container.textContent).toBe("[bb][cc]");
    // The removed wrapper took its nested item's range along: no stray markers.
    expect(h.container.querySelectorAll("i")).toHaveLength(2);
    expect(disposed).toContain("a");
    const comments = [...h.container.childNodes].filter((n) => n.nodeType === 8).length;
    // Ranges are flat siblings: the host's, plus per wrapper its own and its item's. The
    // markup (one <i>) is a single node and needs no markers (F1a).
    expect(comments).toBe(2 + 2 * 4);
  });

  it("removing a component range leaves no nodes behind and disposes it", async () => {
    let show = true;
    const h = await mount((b) => {
      b.addContent(0, "<");
      if (show) item(b, 1, "x");
      b.addContent(3, ">");
    });
    const initial = dump(h.container);
    expect(h.container.textContent).toBe("<xx>");
    show = false;
    disposed.length = 0;
    await h.update();
    expect(dump(h.container)).toBe(initial.replace(/<!--bl-tsazor:2-->.*<!--\/bl-tsazor:2-->/, ""));
    expect(disposed).toEqual(["x"]);
  });
});

describe("applier — a failed pass leaves the DOM of the live tree", () => {
  it("rolls back removals, text/attribute updates, moves and inserts, keeps child components alive", async () => {
    let step = 0;
    let clicks = 0;
    const h = await mount((b) => {
      b.openElement(0, "p");
      b.addAttribute(1, "title", step === 0 ? "t0" : "t1");
      b.addAttribute(2, "onclick", step === 0 ? () => clicks++ : null);
      b.addContent(3, step === 0 ? "text0" : "text1");
      b.closeElement();
      for (const key of step === 0 ? ["a", "b", "c"] : ["c", "a"]) item(b, 4, key, key);
      b.addMarkupContent(6, step === 0 ? "<u>m0</u>" : "<u>m1</u>");
      if (step === 1) {
        // Inserted last: its capture throws after every other edit applied.
        b.openElement(7, "div");
        b.addElementReferenceCapture(8, () => {
          throw new Error("capture failed");
        });
        b.closeElement();
      }
    });
    const before = dump(h.container);
    const nodes = [...h.container.querySelectorAll("*")];
    const children = [...h.state.slotChildren.values()];
    disposed.length = 0;

    step = 1;
    await h.update();
    expect(h.errors.map((e) => [String(e.error), e.phase])).toEqual([["Error: capture failed", "apply"]]);
    expect(dump(h.container)).toBe(before);
    expect([...h.container.querySelectorAll("*")]).toEqual(nodes);
    expect([...h.state.slotChildren.values()]).toEqual(children);
    expect(disposed).toEqual([]);

    // The listener the failed pass detached is attached again.
    const p = h.container.querySelector("p")!;
    p.dispatchEvent(new Event("click"));
    await h.renderer.waitUntilIdle();
    expect(clicks).toBe(1);

    // And the retained tree stays the diff base: back to step 0 is a no-op apart from the handler.
    step = 0;
    await h.update();
    expect(dump(h.container)).toBe(before);
    expect(h.container.querySelector("p")).toBe(p);
    p.dispatchEvent(new Event("click"));
    await h.renderer.waitUntilIdle();
    expect(clicks).toBe(2);
  });

  it("the next pass diffs against the retained tree and applies cleanly", async () => {
    let fail = false;
    let label = "a";
    const h = await mount((b) => {
      b.openElement(0, "span");
      b.addContent(1, label);
      b.closeElement();
      if (fail) {
        b.openElement(2, "em");
        b.addElementReferenceCapture(3, () => {
          throw new Error("nope");
        });
        b.closeElement();
      }
    });
    fail = true;
    label = "b";
    await h.update();
    expect(h.container.textContent).toBe("a");
    fail = false;
    label = "c";
    await h.update();
    expect(h.container.textContent).toBe("c");
    expect(h.container.querySelectorAll("em")).toHaveLength(0);
  });
});

describe("applier — attributes and properties (R10)", () => {
  it("checked / selected follow the render as properties, with the attribute as default", async () => {
    let on = true;
    const h = await mount((b) => {
      b.openElement(0, "input");
      b.addAttribute(1, "type", "checkbox");
      b.addAttribute(2, "checked", on);
      b.closeElement();
      b.openElement(3, "select");
      for (const v of ["x", "y"]) {
        b.openElement(4, "option");
        b.addAttribute(5, "selected", v === "y" ? on : !on);
        b.addContent(6, v);
        b.closeElement();
      }
      b.closeElement();
    });
    const input = h.container.querySelector("input")!;
    const select = h.container.querySelector("select")!;
    expect(input.checked).toBe(true);
    expect(input.hasAttribute("checked")).toBe(true);
    expect(select.value).toBe("y");

    input.click();
    select.value = "x";
    on = false;
    await h.update();
    expect(input.checked).toBe(false);
    expect(input.hasAttribute("checked")).toBe(false);
    expect(select.value).toBe("x");
    on = true;
    await h.update();
    expect(input.checked).toBe(true);
    expect(select.value).toBe("y");
  });

  it("select value waits for its options: rendered by a child component, loaded later, changed afterwards", async () => {
    class Options extends ComponentBase {
      @Parameter() values: string[] = [];
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        for (const v of this.values) {
          b.openElement(0, "option");
          b.setKey(v);
          b.addAttribute(1, "value", v);
          b.addContent(2, v.toUpperCase());
          b.closeElement();
        }
      }
    }
    let values: string[] = [];
    const h = await mount((b) => {
      b.openElement(0, "select");
      b.addAttribute(1, "value", "b");
      b.openComponent(2, defineComponent(Options));
      b.addAttribute(3, "values", values);
      b.closeComponent();
      b.closeElement();
    });
    const select = h.container.querySelector("select")!;
    values = ["a", "b"];
    await h.update();
    expect(select.value).toBe("b");

    // The selected option is replaced (removed, re-added): the value is re-applied.
    values = ["c", "a"];
    await h.update();
    values = ["c", "b", "a"];
    await h.update();
    expect(select.value).toBe("b");
  });

  it("an option whose value changes to the select's value becomes selected", async () => {
    let second = "q";
    const h = await mount((b) => {
      b.openElement(0, "select");
      b.addAttribute(1, "value", "b");
      for (const v of ["a", second]) {
        b.openElement(2, "option");
        b.addAttribute(3, "value", v);
        b.closeElement();
      }
      b.closeElement();
    });
    const select = h.container.querySelector("select")!;
    expect(select.value).not.toBe("b");
    second = "b";
    await h.update();
    expect(select.value).toBe("b");
  });

  it("removing value clears inputs and textareas; a checkbox falls back to its default", async () => {
    let has = true;
    const h = await mount((b) => {
      for (const [seq, tag, type] of [[0, "input", "text"], [3, "textarea", null], [6, "input", "checkbox"]] as const) {
        b.openElement(seq, tag);
        if (type !== null) b.addAttribute(seq + 1, "type", type);
        if (has) b.addAttribute(seq + 2, "value", "v");
        b.closeElement();
      }
    });
    const [text, checkbox] = [...h.container.querySelectorAll("input")];
    const area = h.container.querySelector("textarea")!;
    expect([text!.value, area.value, checkbox!.value]).toEqual(["v", "v", "v"]);
    has = false;
    await h.update();
    expect([text!.value, area.value, checkbox!.value]).toEqual(["", "", "on"]);
  });

  it("booleans are minimized attributes; strings keep attribute semantics", async () => {
    let flag: boolean | null = true;
    const h = await mount((b) => {
      b.openElement(0, "button");
      b.addAttribute(1, "disabled", flag);
      b.addAttribute(2, "hidden", "");
      b.addAttribute(3, "form", "f1");
      b.closeElement();
      b.openElement(4, "img");
      b.addAttribute(5, "width", "100%");
      b.closeElement();
    });
    const button = h.container.querySelector("button")!;
    expect(button.getAttribute("disabled")).toBe("");
    expect(button.hidden).toBe(true);
    expect(button.getAttribute("form")).toBe("f1");
    expect(h.container.querySelector("img")!.getAttribute("width")).toBe("100%");
    flag = false;
    await h.update();
    expect(button.hasAttribute("disabled")).toBe(false);
    flag = true;
    await h.update();
    flag = null;
    await h.update();
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("objects go to writable properties, never to getter-only ones", async () => {
    const payload = { rows: [1, 2] };
    const h = await mount((b) => {
      b.openElement(0, "div");
      b.addAttribute(1, "customData", payload);
      b.closeElement();
      b.openElement(2, "button");
      b.addAttribute(3, "form", { toString: () => "f2" });
      b.closeElement();
    });
    const div = h.container.querySelector("div")!;
    Object.defineProperty(div, "customData", { value: undefined, writable: true, configurable: true });
    await h.update((b) => {
      b.openElement(0, "div");
      b.addAttribute(1, "customData", { rows: [3] });
      b.closeElement();
      b.openElement(2, "button");
      b.addAttribute(3, "form", { toString: () => "f3" });
      b.closeElement();
    });
    expect((div as unknown as { customData: unknown }).customData).toEqual({ rows: [3] });
    expect(h.container.querySelector("button")!.getAttribute("form")).toBe("f3");
    expect(h.errors).toEqual([]);
  });

  it("a changed handler reuses the DOM listener; null, a string or removal detaches it", async () => {
    const calls: string[] = [];
    let handler: unknown = () => calls.push("first");
    const h = await mount((b) => {
      b.openElement(0, "button");
      if (handler !== undefined) b.addAttribute(1, "onClick", handler as never);
      b.closeElement();
    });
    const button = h.container.querySelector("button")!;
    let adds = 0;
    let removes = 0;
    const add = button.addEventListener.bind(button);
    const remove = button.removeEventListener.bind(button);
    button.addEventListener = ((...args: Parameters<typeof add>) => {
      adds++;
      add(...args);
    }) as typeof add;
    button.removeEventListener = ((...args: Parameters<typeof remove>) => {
      removes++;
      remove(...args);
    }) as typeof remove;

    const receiver = new Fn();
    handler = EventCallback.bind(receiver, () => calls.push("second"));
    await h.update();
    button.dispatchEvent(new Event("click"));
    await h.renderer.waitUntilIdle();
    expect(calls).toEqual(["second"]);
    expect([adds, removes]).toEqual([0, 0]);

    for (const next of [null, () => calls.push("third"), "void 0", () => calls.push("fourth"), undefined]) {
      handler = next;
      await h.update();
      button.dispatchEvent(new Event("click"));
      await h.renderer.waitUntilIdle();
    }
    expect(calls).toEqual(["second", "third", "fourth"]);
    expect(button.hasAttribute("onClick")).toBe(false);
    // Detached for null, the string and the removal; attached for the two functions.
    expect([adds, removes]).toEqual([2, 3]);
  });
});

describe("applier — event modifier flags (A5, review C15)", () => {
  const click = (target: Element): Event => {
    const event = new Event("click", { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event;
  };

  it("follows __internal_preventDefault_<event> / __internal_stopPropagation_<event> per render", async () => {
    let prevent: unknown = true;
    let stop: unknown = false;
    let calls = 0;
    let bubbled = 0;
    const h = await mount((b) => {
      b.openElement(0, "div");
      b.addAttribute(1, "onclick", () => bubbled++);
      b.openElement(2, "a");
      b.addAttribute(3, "onclick", () => calls++);
      b.addAttribute(4, "__internal_preventDefault_onclick", prevent);
      b.addAttribute(5, "__internal_stopPropagation_onclick", stop);
      b.closeElement();
      b.closeElement();
    });
    const a = h.container.querySelector("a")!;
    // Never a DOM attribute.
    expect(a.getAttributeNames()).toEqual([]);
    expect(click(a).defaultPrevented).toBe(true);
    await h.renderer.waitUntilIdle();
    expect([calls, bubbled]).toEqual([1, 1]);

    prevent = false;
    stop = true;
    await h.update();
    expect(click(a).defaultPrevented).toBe(false);
    await h.renderer.waitUntilIdle();
    expect([calls, bubbled]).toEqual([2, 1]);

    prevent = null;
    stop = undefined;
    await h.update();
    expect(click(a).defaultPrevented).toBe(false);
    await h.renderer.waitUntilIdle();
    expect([calls, bubbled]).toEqual([3, 2]);
  });

  it("prevents default without a handler and drops the listener once the flag goes", async () => {
    let prevent = true;
    let withHandler = false;
    let calls = 0;
    const h = await mount((b) => {
      b.openElement(0, "form");
      if (withHandler) b.addAttribute(1, "onsubmit", () => calls++);
      if (prevent) b.addAttribute(2, "__internal_preventDefault_onsubmit", true);
      b.closeElement();
    });
    const form = h.container.querySelector("form")!;
    const submit = (): boolean => {
      const event = new Event("submit", { cancelable: true });
      form.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(submit()).toBe(true);

    // A handler joins the flag's listener; removing the handler keeps the flag.
    withHandler = true;
    await h.update();
    expect(submit()).toBe(true);
    await h.renderer.waitUntilIdle();
    expect(calls).toBe(1);
    withHandler = false;
    await h.update();
    expect(submit()).toBe(true);
    await h.renderer.waitUntilIdle();
    expect(calls).toBe(1);

    prevent = false;
    await h.update();
    expect(submit()).toBe(false);
  });

  it("keeps the static EventHandlerFlags of addEventHandler (compat)", async () => {
    const h = await mount((b) => {
      b.openElement(0, "a");
      b.addEventHandler(1, "onclick", EventCallback.unbound(() => {}), 1 /* PreventDefault */);
      b.closeElement();
    });
    expect(click(h.container.querySelector("a")!).defaultPrevented).toBe(true);
  });

  it("rolls a modifier change back with a failed pass", async () => {
    let step = 0;
    const h = await mount((b) => {
      b.openElement(0, "a");
      b.addAttribute(1, "__internal_preventDefault_onclick", step === 0);
      b.closeElement();
      if (step === 1) {
        b.openElement(2, "div");
        b.addElementReferenceCapture(3, () => {
          throw new Error("capture failed");
        });
        b.closeElement();
      }
    });
    step = 1;
    await h.update();
    expect(h.errors).toHaveLength(1);
    expect(click(h.container.querySelector("a")!).defaultPrevented).toBe(true);
  });
});

describe("input value normalization (Blazor normalizeInputValue)", () => {
  async function inputWith(attrs: Record<string, string>): Promise<string> {
    const container = document.createElement("div");
    const renderer = new Renderer();
    const state = renderer.renderInContainer(Fn, container);
    (state.component as Fn).build = (b) => {
      b.openElement(0, "input");
      let seq = 1;
      for (const [name, value] of Object.entries(attrs)) b.addAttribute(seq++, name, value);
      b.closeElement();
    };
    (state.component as unknown as { stateHasChanged(): void }).stateHasChanged();
    await renderer.waitUntilIdle();
    return container.querySelector("input")!.value;
  }

  it("trims :00 seconds and seconds without step on time/datetime-local, keeps them otherwise", async () => {
    expect(await inputWith({ type: "time", value: "13:45:00" })).toBe("13:45");
    expect(await inputWith({ type: "time", value: "13:45:30" })).toBe("13:45");
    expect(await inputWith({ type: "time", step: "1", value: "13:45:30" })).toBe("13:45:30");
    expect(await inputWith({ type: "datetime-local", value: "2026-09-30T13:45:00" })).toBe("2026-09-30T13:45");
    expect(await inputWith({ type: "datetime-local", step: "1", value: "2026-09-30T13:45:30" })).toBe("2026-09-30T13:45:30");
    expect(await inputWith({ type: "text", value: "13:45:00" })).toBe("13:45:00");
  });
});

describe("F1a — markup blocks: parsed once, single-node blocks without markers", () => {
  it("a single-node block is inserted as that node — no boundary comments — and every insertion is a separate copy", async () => {
    const h = await mount((b) => {
      for (let i = 0; i < 3; i++) b.addMarkupContent(0, '<span aria-hidden="true">x</span>');
    });
    expect(dump(h.container)).not.toContain("bl-tsazor:markup");
    const spans = [...h.container.querySelectorAll("span")];
    expect(spans).toHaveLength(3);
    expect(new Set(spans).size).toBe(3);
    expect(spans.every((span) => span.ownerDocument === document)).toBe(true);
  });

  it("multi-node markup (a MarkupString) keeps its markers; a changed string replaces either shape", async () => {
    let one = '<b>one</b>';
    let two = "<i>a</i><i>b</i>";
    const h = await mount((b) => {
      b.addMarkupContent(0, one);
      b.addMarkupContent(1, two);
    });
    expect(h.container.innerHTML).toContain("<!--bl-tsazor:markup--><i>a</i><i>b</i><!--/bl-tsazor:markup-->");
    one = "<b>uno</b>";
    two = "<u>c</u>";
    await h.update();
    expect(h.container.textContent).toBe("unoc");
    expect(dump(h.container)).not.toContain("bl-tsazor:markup");
    one = "<b>1</b><b>2</b>";
    await h.update();
    expect(h.container.textContent).toBe("12c");
  });

  it("a block is parsed once however often it is inserted", async () => {
    const original = HTMLTemplateElement.prototype;
    let parses = 0;
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")!;
    Object.defineProperty(original, "innerHTML", {
      configurable: true,
      set(value: string) {
        parses++;
        descriptor.set!.call(this, value);
      },
      get() {
        return descriptor.get!.call(this);
      },
    });
    try {
      await mount((b) => {
        for (let i = 0; i < 50; i++) b.addMarkupContent(0, '<em class="parse-once">x</em>');
      });
      expect(parses).toBe(1);
    } finally {
      delete (original as unknown as Record<string, unknown>).innerHTML;
    }
  });
});

describe("F1a — table parts as blocks", () => {
  it("a static <td>, <tr> or <col> block keeps its tags (parsed inside its table structure)", async () => {
    const h = await mount((b) => {
      b.openElement(0, "table");
      b.openElement(1, "tbody");
      b.openElement(2, "tr");
      b.addMarkupContent(3, '<td class="x">Subtotal</td>');
      b.openElement(4, "td");
      b.addContent(5, "€1");
      b.closeElement();
      b.closeElement();
      b.addMarkupContent(6, "<tr><th>Total</th></tr>");
      b.closeElement();
      b.openElement(7, "colgroup");
      b.addMarkupContent(8, '<col span="2">');
      b.closeElement();
      b.closeElement();
    });
    expect(h.container.innerHTML.replace(/<!--[^>]*-->/g, "")).toBe(
      '<table><tbody><tr><td class="x">Subtotal</td><td>€1</td></tr><tr><th>Total</th></tr></tbody><colgroup><col span="2"></colgroup></table>',
    );
  });
});
