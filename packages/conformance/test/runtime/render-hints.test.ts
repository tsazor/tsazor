/**
 * H1 render hints (docs/design-render-hints.md): a compiled event-handler
 * lambda is equal across renders while the values it captures are the same,
 * so re-rendering unchanged rows swaps no handler; a changed captured value
 * swaps it, and the new handler runs. H2: an unchanged keyed row is reused
 * (neither built nor diffed); the DOM and child component renders stay as
 * without hints. H4: child content that uses only the component is the same
 * function on every render, as a C# lambda on `this` is an equal delegate.
 */
import { describe, expect, it } from "vitest";
import { EventCallback, RenderTreeBuilder, RenderTreeEditType, type Renderer, type RenderTreeEdit, type RenderTreeFrame } from "@tsazor/runtime";
import { compileFiles, mount } from "../harness.js";
// Blazor's ChangeDetection.MayHaveChanged (internal to the runtime).
import { mayHaveChanged } from "../../../runtime/src/components/change-detection.js";

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

/** Counts the rows reused by RenderTreeBuilder.reuseKeyed (H2), spied on the prototype. */
function reusedRows(): { count(): number; restore(): void } {
  const proto = RenderTreeBuilder.prototype as unknown as { reuseKeyed(...args: unknown[]): boolean };
  const original = proto.reuseKeyed;
  let count = 0;
  proto.reuseKeyed = function (this: unknown, ...args: unknown[]) {
    const reused = original.apply(this, args);
    if (reused) count++;
    return reused;
  };
  return { count: () => count, restore: () => { proto.reuseKeyed = original; } };
}

/** The edits the renderer applies (its DOM applier, spied), StepIn/StepOut left out. */
function appliedEdits(renderer: Renderer): () => RenderTreeEditType[] {
  type Applier = { applyEdits(state: unknown, frames: RenderTreeFrame[], edits: RenderTreeEdit[]): void };
  const dom = (renderer as unknown as { dom: Applier }).dom;
  const apply = dom.applyEdits.bind(dom);
  let types: RenderTreeEditType[] = [];
  dom.applyEdits = (state, frames, edits) => {
    for (const edit of edits) {
      if (edit.type !== RenderTreeEditType.StepIn && edit.type !== RenderTreeEditType.StepOut) types.push(edit.type);
    }
    apply(state, frames, edits);
  };
  return () => {
    const result = types;
    types = [];
    return result;
  };
}

describe("H2 — skipping unchanged keyed rows", () => {
  const TABLE = /* tsazor */ `
<table><tbody>
@foreach (const row of rows) {
    <tr @key="row.id" class="@rowClass(row)">
        <td>@row.id</td>
        <td class="title" @onclick="e => select(e, row)">@row.label</td>
        <td><span>x</span></td>
    </tr>
}
</tbody></table>
@code {
    rows = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, label: "row " + (i + 1) }));
    selected = -1;
    rowClass(row) { return row.id === this.selected ? "selected" : ""; }
    select(e, row) { this.selected = row.id; }
}
`;

  it("select: only the two changed rows produce edits; the others are reused", async () => {
    const reused = reusedRows();
    try {
      const m = await mount(TABLE);
      const edits = appliedEdits(m.renderer);
      m.container.querySelectorAll<HTMLElement>("td.title")[4]!.click();
      await m.settle();
      expect(edits()).toEqual([RenderTreeEditType.SetAttribute]);
      const before = reused.count();
      m.container.querySelectorAll<HTMLElement>("td.title")[9]!.click();
      await m.settle();
      expect(edits()).toEqual([RenderTreeEditType.SetAttribute, RenderTreeEditType.SetAttribute]);
      expect(reused.count() - before).toBe(18);
      expect(m.container.querySelector("tr.selected td")!.textContent).toBe("10");
    } finally {
      reused.restore();
    }
  });

  it("keyed moves, removals and insertions around reused rows: the DOM equals a render without hints", async () => {
    const optimized = await mount(TABLE);
    const reference = await mount(TABLE, "Test.tsazor", { renderHints: false });
    type Rows = Array<{ id: number; label: string }>;
    const steps: Array<(rows: Rows) => Rows> = [
      (rows) => [rows[5]!, ...rows.slice(1, 5), rows[0]!, ...rows.slice(6)],
      (rows) => rows.filter((r) => r.id % 3 !== 0),
      (rows) => [{ id: 100, label: "first" }, ...rows, { id: 101, label: "last" }],
      (rows) => rows.map((r, i) => (i % 4 === 0 ? { ...r, label: r.label + " !!!" } : r)),
      (rows) => [...rows].reverse(),
    ];
    for (const step of steps) {
      for (const m of [optimized, reference]) {
        m.instance["rows"] = step(m.instance["rows"] as Rows);
        await m.rerender();
      }
      expect(optimized.html()).toBe(reference.html());
    }
    // Handlers still run on reused rows.
    optimized.container.querySelectorAll<HTMLElement>("td.title")[2]!.click();
    reference.container.querySelectorAll<HTMLElement>("td.title")[2]!.click();
    await optimized.settle();
    await reference.settle();
    expect(optimized.html()).toBe(reference.html());
  });
});

describe("H2 — child components in rows keep Blazor's re-render rule", () => {
  const CHILD = `<span>@label</span>
@code {
    @Parameter() label = "";
    @Parameter() count: number = 0;
    @Parameter() item: unknown = null;
    @Parameter() loose;
    @Parameter() onPick?: EventCallback<void>;
    override onParametersSet() {
        const counts = (globalThis as Record<string, unknown>).__rowChildSets as Record<string, number>;
        counts[this.label] = (counts[this.label] ?? 0) + 1;
    }
}`;
  const test = (child: string) => ({
    "Child.tsazor": CHILD,
    "Test.tsazor": `@import Child from "./Child.tsazor"
<ul>
@foreach (const row of rows) {
    <li @key="row.id">${child}</li>
}
</ul>
@code {
    rows = [{ id: 1, label: "a" }, { id: 2, label: "b" }];
    picked: unknown = null;
    pick(row: unknown) { this.picked = row; }
}`,
  });

  async function setsAfterRerender(child: string): Promise<{ counts: Record<string, number>; reused: number }> {
    const counts: Record<string, number> = {};
    (globalThis as Record<string, unknown>).__rowChildSets = counts;
    const reused = reusedRows();
    try {
      const m = await mount(test(child));
      expect(counts).toEqual({ a: 1, b: 1 });
      await m.rerender();
      return { counts, reused: reused.count() };
    } finally {
      reused.restore();
    }
  }

  it("a child getting a capturing handler re-renders every parent render (the row is not reused)", async () => {
    const { counts, reused } = await setsAfterRerender(`<Child Label="@row.label" OnPick="() => pick(row)" />`);
    expect(counts).toEqual({ a: 2, b: 2 });
    expect(reused).toBe(0);
  });

  it("a child getting only unchanged primitives is skipped with its row — Blazor does not re-render it either", async () => {
    const { counts, reused } = await setsAfterRerender(`<Child Label="@row.label" Count="@row.id" />`);
    expect(reused).toBe(2);
    expect(counts).toEqual({ a: 1, b: 1 });
    // Blazor's ChangeDetection.MayHaveChanged for the same parameter values.
    expect(mayHaveChanged("a", "a")).toBe(false);
    expect(mayHaveChanged(1, 1)).toBe(false);
  });

  it("a child with an object parameter re-renders every parent render (declared object type: not reused)", async () => {
    const { counts, reused } = await setsAfterRerender(`<Child Label="@row.label" Item="@row" />`);
    expect(counts).toEqual({ a: 2, b: 2 });
    expect(reused).toBe(0);
    expect(mayHaveChanged({}, {})).toBe(true);
  });

  it("a child with an untyped parameter that gets an object re-renders (checked at runtime)", async () => {
    const { counts, reused } = await setsAfterRerender(`<Child Label="@row.label" Loose="@row" />`);
    expect(counts).toEqual({ a: 2, b: 2 });
    expect(reused).toBe(0);
  });
});

describe("H4 — child content is the same fragment across renders", () => {
  const inits = (): string[] => (globalThis as Record<string, unknown>).__inits as string[];
  const files = (content: string) => ({
    "Child.tsazor": `<i>child</i>
@code {
    override onInitialized() { ((globalThis as Record<string, unknown>).__inits as string[]).push("child"); }
}`,
    "Test.tsazor": `@import Child from "./Child.tsazor"
${content}
<SectionOutlet SectionName="s" />
@code { count = 0; labels = ["a"]; }`,
  });
  const MEMBERS_ONLY = `<SectionContent SectionName="s"><p class="kept">@count</p><Child /></SectionContent>`;

  it("content that uses only the component keeps its DOM and instances while the component re-renders (C#: an equal delegate)", async () => {
    (globalThis as Record<string, unknown>).__inits = [];
    const m = await mount(files(MEMBERS_ONLY));
    const p = m.container.querySelector(".kept");
    m.instance.count = 1;
    await m.rerender();
    expect(m.container.querySelector(".kept")).toBe(p);
    expect(p?.textContent).toBe("1");
    expect(inits()).toEqual(["child"]);
  });

  it("content that uses a loop variable is a new fragment per render (C#: a new closure): the outlet rebuilds it", async () => {
    (globalThis as Record<string, unknown>).__inits = [];
    const m = await mount(files(`@foreach (const label of labels) { <SectionContent SectionName="s"><p class="kept">@label</p><Child /></SectionContent> }`));
    const p = m.container.querySelector(".kept");
    await m.rerender();
    expect(m.container.querySelector(".kept")).not.toBe(p);
    expect(m.text()).toBe("achild");
    expect(inits()).toEqual(["child", "child"]);
  });

  it("optimize: false makes every fragment new per render (the emergency switch); renderHints: false doesn't", async () => {
    (globalThis as Record<string, unknown>).__inits = [];
    const m = await mount(files(MEMBERS_ONLY), "Test.tsazor", { optimize: false });
    const p = m.container.querySelector(".kept");
    await m.rerender();
    expect(m.container.querySelector(".kept")).not.toBe(p);
    expect(inits()).toEqual(["child", "child"]);

    const hintsOff = await mount(files(MEMBERS_ONLY), "Test.tsazor", { renderHints: false });
    const kept = hintsOff.container.querySelector(".kept");
    await hintsOff.rerender();
    expect(hintsOff.container.querySelector(".kept")).toBe(kept);
  });

  it("an HMR swap renders the new version's content, not the fragment cached by the old one", async () => {
    (globalThis as Record<string, unknown>).__inits = [];
    const m = await mount(files(MEMBERS_ONLY));
    const next = await compileFiles(files(`<SectionContent SectionName="s"><p class="kept">v2 @count</p><Child /></SectionContent>`));
    const { default: Next } = await import(/* @vite-ignore */ next.modules["Test.tsazor"]!);
    m.renderer.hmrSwap(m.instance.constructor, Next);
    await m.settle();
    expect(m.text()).toBe("v2 0child");
  });
});
