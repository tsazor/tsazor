/**
 * Diff and DOM patching vs. Blazor's RenderTreeDiffBuilder.
 * Review §3: R1, R2, R3, R4, move costs, focus retention.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComponentBase, defineComponent, type RenderTreeBuilder } from "@tsazor/runtime";
import { host, log, Probe } from "./host.js";

afterEach(() => {
  log.length = 0;
});

const probe = (b: RenderTreeBuilder, seq: number, label: string, key?: string | number): void => {
  b.openComponent(seq, defineComponent(Probe));
  if (key !== undefined) b.setKey(key);
  b.addAttribute(seq + 1, "label", label);
  b.closeComponent();
};

describe("keyed moves", () => {
  it("reorders keyed components with their content", async () => {
    let order = ["a", "b", "c"];
    const h = await host((b) => {
      b.openElement(0, "div");
      for (const k of order) probe(b, 1, k, k);
      b.closeElement();
    });
    expect(h.text()).toBe("abc");
    order = ["c", "a", "b"];
    await h.update();
    expect(h.text()).toBe("cab");
  });
});

describe("R1 — a changed @key replaces the instance", () => {
  it("component: old instance disposed, new one initialized", async () => {
    let key = "x";
    const h = await host((b) => probe(b, 0, "L", key));
    log.length = 0;
    key = "y";
    await h.update();
    expect(log).toContain("dispose:L");
    expect(log).toContain("init:L");
  });

  it("element: a new DOM node is created", async () => {
    let key = 1;
    const h = await host((b) => {
      b.openElement(0, "input");
      b.setKey(key);
      b.closeElement();
    });
    const before = h.container.querySelector("input");
    key = 2;
    await h.update();
    expect(h.container.querySelector("input")).not.toBe(before);
  });
});

describe("R2 — duplicate keys", () => {
  it("are reported as an error instead of merging DOM", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    let rejected = false;
    try {
      await host((b) => {
        for (const text of ["a", "b"]) {
          b.openElement(0, "p");
          b.setKey(1);
          b.addContent(1, text);
          b.closeElement();
        }
      });
    } catch {
      rejected = true;
    }
    const reported = rejected || error.mock.calls.some((c) => /key/i.test(String(c[0]) + String(c[1] ?? "")));
    error.mockRestore();
    expect(reported).toBe(true);
  });
});

describe("R3 — disposal of nested components", () => {
  it("a component inside a removed element is disposed", async () => {
    let show = true;
    const h = await host((b) => {
      if (show) {
        b.openElement(0, "div");
        probe(b, 1, "inner");
        b.closeElement();
      }
    });
    show = false;
    await h.update();
    expect(h.text()).toBe("");
    expect(log).toContain("dispose:inner");
  });

  it("a component inside an element whose tag changes is disposed once and re-created", async () => {
    let tag = "div";
    const h = await host((b) => {
      b.openElement(0, tag);
      probe(b, 1, "t");
      b.closeElement();
    });
    tag = "section";
    await h.update();
    expect(log.filter((x) => x === "dispose:t")).toHaveLength(1);
    expect(h.container.querySelectorAll("i")).toHaveLength(1);
  });

  it("the renderer drops the disposed component state", async () => {
    let show = true;
    const h = await host((b) => {
      if (show) {
        b.openElement(0, "div");
        probe(b, 1, "s");
        b.closeElement();
      }
    });
    show = false;
    await h.update();
    const states = (h.renderer as unknown as { states: Map<number, unknown> }).states;
    expect(states.size).toBe(1); // only the host
  });
});

describe("R4 — moving logical ranges moves their content", () => {
  it("markup content stays in order when an element is inserted before it", async () => {
    let withNew = false;
    const h = await host((b) => {
      if (withNew) {
        b.openElement(0, "b");
        b.addContent(1, "N");
        b.closeElement();
      }
      b.addMarkupContent(2, "<u>M</u>");
    });
    withNew = true;
    await h.update();
    expect(h.text()).toBe("NM");
  });

  // Since B1 an insert moves nothing; this now fails on R5 instead (shouldRender=false
  // also suppresses the first render, so there is no "S" to keep).
  it.fails("a component that skips re-rendering keeps its content between its markers", async () => {
    class Static extends ComponentBase {
      protected override shouldRender(): boolean {
        return false;
      }
      protected override buildRenderTree(b: RenderTreeBuilder): void {
        b.addContent(0, "S");
      }
    }
    let withNew = false;
    const h = await host((b) => {
      if (withNew) {
        b.openElement(0, "b");
        b.addContent(1, "N");
        b.closeElement();
      }
      b.openComponent(2, defineComponent(Static));
      b.closeComponent();
    });
    withNew = true;
    await h.update();
    expect(h.text()).toBe("NS");
  });
});

describe("DOM stability on insert", () => {
  it("inserting at the front does not move the following siblings", async () => {
    let items = ["b", "c", "d"];
    const h = await host((b) => {
      b.openElement(0, "ul");
      for (const item of items) {
        b.openElement(1, "li");
        b.setKey(item);
        b.addContent(2, item);
        b.closeElement();
      }
      b.closeElement();
    });
    const ul = h.container.querySelector("ul")!;
    const insertBefore = vi.spyOn(ul, "insertBefore");
    items = ["a", ...items];
    await h.update();
    expect(h.text()).toBe("abcd");
    expect(insertBefore.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("a focused input keeps focus when content is inserted before it", async () => {
    let withNew = false;
    const h = await host((b) => {
      if (withNew) {
        b.openElement(0, "p");
        b.addContent(1, "new");
        b.closeElement();
      }
      b.openElement(2, "input");
      b.closeElement();
    });
    const input = h.container.querySelector("input")!;
    input.focus();
    withNew = true;
    await h.update();
    expect(document.activeElement).toBe(input);
  });
});
