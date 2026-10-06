/**
 * H1 render hints (docs/design-render-hints.md): a compiled event-handler
 * lambda is equal across renders while the values it captures are the same,
 * so re-rendering unchanged rows swaps no handler; a changed captured value
 * swaps it, and the new handler runs.
 */
import { describe, expect, it } from "vitest";
import { EventCallback, RenderTreeEditType, type Renderer, type RenderTreeEdit, type RenderTreeFrame } from "@tsazor/runtime";
import { mount } from "../harness.js";

const ROWS = /* tsazor */ `
<ul>
@foreach (const row of rows) {
    <li @key="row.id"><a class="select" @onclick="() => select(row)">@row.label</a><button @onclick="e => remove(e, row)">x</button></li>
}
</ul>
<p>@picked</p>
@code {
    rows = [{ id: 1, label: "a" }, { id: 2, label: "b" }, { id: 3, label: "c" }];
    picked = "";
    select(row) { this.picked = row.label; }
    remove(e, row) { this.rows = this.rows.filter((r) => r !== row); }
}
`;

/** Counts the SetAttribute edits that set an event handler (the renderer's DOM applier, spied). */
function handlerEdits(renderer: Renderer): () => number {
  type Applier = { applyEdits(state: unknown, frames: RenderTreeFrame[], edits: RenderTreeEdit[]): void };
  const dom = (renderer as unknown as { dom: Applier }).dom;
  const apply = dom.applyEdits.bind(dom);
  let count = 0;
  dom.applyEdits = (state, frames, edits) => {
    for (const edit of edits) {
      if (edit.type === RenderTreeEditType.SetAttribute && frames[edit.referenceFrameIndex]!.attributeValue instanceof EventCallback) count++;
    }
    apply(state, frames, edits);
  };
  return () => count;
}

describe("H1 — stable event handlers", () => {
  it("re-rendering unchanged rows produces no handler edits", async () => {
    const m = await mount(ROWS);
    const edits = handlerEdits(m.renderer);
    await m.rerender();
    expect(edits()).toBe(0);
    m.container.querySelectorAll<HTMLElement>("a.select")[1]!.click();
    await m.settle();
    expect(m.text()).toContain("b");
    expect(edits()).toBe(0);
  });

  it("a changed captured value swaps the handler, and the new one runs", async () => {
    const m = await mount(ROWS);
    const edits = handlerEdits(m.renderer);
    const rows = m.instance["rows"] as Array<{ id: number; label: string }>;
    m.instance["rows"] = [{ id: 1, label: "z" }, ...rows.slice(1)];
    await m.rerender();
    expect(edits()).toBe(2); // the two handlers of row 1
    m.container.querySelector<HTMLElement>("a.select")!.click();
    await m.settle();
    expect(m.container.querySelector("p")!.textContent).toBe("z");
    m.container.querySelectorAll<HTMLElement>("button")[2]!.click();
    await m.settle();
    expect(m.text()).not.toContain("c x");
    expect(m.container.querySelectorAll("li").length).toBe(2);
  });

  it("renderHints: false swaps every handler per render (the escape hatch)", async () => {
    const m = await mount(ROWS, "Test.tsazor", { renderHints: false });
    const edits = handlerEdits(m.renderer);
    await m.rerender();
    expect(edits()).toBe(6);
  });
});

describe("H1 — child components keep Blazor's re-render rule", () => {
  const files = {
    "Child.tsazor": `<span>@label</span>
@code {
    @Parameter() label = "";
    @Parameter() onPick?: EventCallback<void>;
    override onParametersSet() {
        const counts = (globalThis as Record<string, unknown>).__childSets as Record<string, number>;
        counts[this.label] = (counts[this.label] ?? 0) + 1;
    }
}`,
    "Test.tsazor": `@import Child from "./Child.tsazor"
@foreach (const row of rows) {
    <Child @key="row.id" Label="@row.label" OnPick="() => pick(row)" />
}
<Child Label="this-only" OnPick="() => pick(null)" />
@code {
    rows = [{ id: 1, label: "a" }, { id: 2, label: "b" }];
    picked: unknown = null;
    pick(row: unknown) { this.picked = row; }
}`,
  };

  it("a handler that captures locals counts as changed (a new closure in C#): the child re-renders", async () => {
    const counts: Record<string, number> = {};
    (globalThis as Record<string, unknown>).__childSets = counts;
    const m = await mount(files);
    expect(counts).toEqual({ a: 1, b: 1, "this-only": 1 });
    await m.rerender();
    // Blazor: `() => Pick(row)` captures `row` — a new delegate target every render ⇒ the child gets
    // its parameters again; `() => Pick(null)` captures only `this` — Delegate.Equals ⇒ unchanged.
    expect(counts).toEqual({ a: 2, b: 2, "this-only": 1 });
  });
});
