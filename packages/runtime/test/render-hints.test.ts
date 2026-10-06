/**
 * H2 render hints (docs/design-render-hints.md): `RenderTreeBuilder.reuseKeyed`
 * copies an unchanged keyed row from the previous render's builder, and the
 * diff skips it. These tests drive the builder the way generated code does
 * and check that reuse never changes the edits — every scenario's diff
 * equals the diff of the same render built without reuse.
 */
import { describe, expect, it } from "vitest";
import { ComponentBase, EventCallback, Parameter, RenderTreeBuilder, Renderer, computeDiff, defineComponent, type RenderTreeFrame } from "../src/index";

interface Row {
  id: number;
  label: string;
}

const SITE: readonly number[] = [0, 2];

class Cell extends ComponentBase {
  @Parameter() value = 0;
  sets = 0;
  protected override onParametersSet(): void {
    this.sets++;
  }
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    b.addContent(0, this.value);
  }
}
const CellType = defineComponent(Cell);

/** The frames generated code writes for a list of rows (`reuse`: through reuseKeyed). */
function buildRows(b: RenderTreeBuilder, rows: readonly Row[], selected: number, reuse: boolean, withCell = false): number {
  let reused = 0;
  b.openElement(0, "tbody");
  for (const row of rows) {
    const key = row.id;
    const cls = row.id === selected ? "selected" : "";
    const label = row.label;
    const values = withCell ? [cls, label, row.id] : [cls, label];
    if (reuse && b.reuseKeyed(withCell ? CELL_SITE : SITE, key, values)) {
      reused++;
      continue;
    }
    b.openElement(1, "tr");
    b.setKey(key);
    b.addAttribute(2, "class", cls);
    b.openElement(3, "td");
    b.addContent(4, label);
    b.closeElement();
    if (withCell) {
      b.openComponent(5, CellType);
      b.addAttribute(6, "value", row.id);
      b.closeComponent();
    }
    b.closeElement();
  }
  b.closeElement();
  return reused;
}
const CELL_SITE: readonly number[] = [0, 2, 1];

/** A component's builder pair, as ComponentState wires it. */
function pair(): [RenderTreeBuilder, RenderTreeBuilder] {
  const a = new RenderTreeBuilder();
  const b = new RenderTreeBuilder();
  a.setReuseSource(b);
  b.setReuseSource(a);
  return [a, b];
}

const rows = (...ids: number[]): Row[] => ids.map((id) => ({ id, label: `row ${id}` }));

describe("H2 — RenderTreeBuilder.reuseKeyed", () => {
  it("copies the previous render's row — the same frame objects — when every value is the same", () => {
    const [first, second] = pair();
    const list = rows(1, 2, 3);
    expect(buildRows(first, list, -1, true)).toBe(0);
    expect(buildRows(second, list, -1, true)).toBe(3);
    expect(second.getFrames()).toEqual(first.getFrames());
    expect(second.getFrames()[1]).toBe(first.getFrames()[1]);
  });

  it("builds a row whose value changed", () => {
    const [first, second] = pair();
    const list = rows(1, 2, 3);
    buildRows(first, list, -1, true);
    expect(buildRows(second, list, 2, true)).toBe(2);
    const plain = new RenderTreeBuilder();
    buildRows(plain, list, 2, false);
    expect(second.getFrames()).toEqual(plain.getFrames());
  });

  it("compares event callbacks with EventCallback.equals, other values with Object.is", () => {
    const [first, second] = pair();
    const receiver = {};
    const factory = (n: number) => () => n;
    const site: readonly number[] = [0, 0];
    const build = (b: RenderTreeBuilder, value: unknown): boolean => {
      const callback = EventCallback.bindWith(receiver as never, factory, [1]);
      if (b.reuseKeyed(site, "k", [callback, value])) return true;
      b.openElement(0, "a");
      b.setKey("k");
      b.addEventHandler(1, "onclick", callback);
      b.addAttribute(2, "title", value as string);
      b.closeElement();
      return false;
    };
    const object = {};
    expect(build(first, object)).toBe(false);
    first.clear(); // keep `first` as the live tree: rebuild it
    build(first, object);
    expect(build(second, object)).toBe(true);
    first.clear();
    expect(build(first, {})).toBe(false);
  });

  it("never reuses a row whose component parameter (check 1) is an object or whose content (check 2) is a function", () => {
    const site: readonly number[] = [1, 2];
    const object = { id: 1 };
    const fragment = () => {};
    const build = (b: RenderTreeBuilder, param: unknown, content: unknown): boolean => {
      if (b.reuseKeyed(site, 1, [param, content])) return true;
      b.openElement(0, "tr");
      b.setKey(1);
      b.closeElement();
      return false;
    };
    for (const [param, content, reused] of [[object, "x", false], [1, fragment, false], [1, "x", true], [null, undefined, true]] as const) {
      const [first, second] = pair();
      build(first, param, content);
      expect(build(second, param, content)).toBe(reused);
    }
  });

  it("matches rows by site and key only: another site, a cleared source or no source builds the row", () => {
    const [first, second] = pair();
    const list = rows(1);
    buildRows(first, list, -1, true);
    expect(second.reuseKeyed([0, 2], 1, ["", "row 1"])).toBe(false); // equal values, another site array (another module evaluation)
    second.clear();
    first.clear();
    expect(buildRows(second, list, -1, true)).toBe(0);
    expect(buildRows(new RenderTreeBuilder(), list, -1, true)).toBe(0);
  });
});

describe("H2 — the diff skips reused rows", () => {
  const scenarios: Array<[string, Row[], Row[], number]> = [
    ["nothing changed", rows(1, 2, 3, 4), rows(1, 2, 3, 4), -1],
    ["select (two rows change)", rows(1, 2, 3, 4), rows(1, 2, 3, 4), 3],
    ["swap", rows(1, 2, 3, 4), rows(1, 4, 3, 2), -1],
    ["remove", rows(1, 2, 3, 4), rows(1, 3, 4), -1],
    ["insert at the start", rows(1, 2, 3), rows(9, 1, 2, 3), -1],
    ["append", rows(1, 2), rows(1, 2, 3, 4), -1],
    ["reverse", rows(1, 2, 3, 4), rows(4, 3, 2, 1), 2],
    ["replace all", rows(1, 2), rows(5, 6, 7), -1],
    ["clear", rows(1, 2), [], -1],
  ];

  it.each(scenarios)("%s: the same edits and components as without reuse", (_, before, after, selected) => {
    for (const withCell of [false, true]) {
      const [first, second] = pair();
      buildRows(first, before, 1, true, withCell);
      buildRows(second, after, selected, true, withCell);
      const plain = new RenderTreeBuilder();
      buildRows(plain, after, selected, false, withCell);
      const old: RenderTreeFrame[] = first.getFrames();
      expect(second.getFrames()).toEqual(plain.getFrames());
      const optimized = computeDiff(old, second.getFrames());
      const reference = computeDiff(old, plain.getFrames());
      expect(optimized).toEqual(reference);
    }
  });

  it("a reused row produces no edits; a changed one is diffed as before", () => {
    const [first, second] = pair();
    buildRows(first, rows(1, 2, 3), -1, true);
    buildRows(second, rows(1, 2, 3), 2, true);
    const diff = computeDiff(first.getFrames(), second.getFrames());
    // Only the class of row 2: step into tbody, set the attribute on the second row.
    expect(diff.edits.map((e) => e.type)).toEqual([6, 3, 7]);
    expect(diff.edits[1]!.siblingIndex).toBe(1);
  });
});

describe("H2 — DOM and child components", () => {
  class Table extends ComponentBase {
    list: Row[] = rows(1, 2, 3, 4);
    selected = -1;
    reuse = true;
    reused = 0;
    protected override buildRenderTree(b: RenderTreeBuilder): void {
      this.reused += buildRows(b, this.list, this.selected, this.reuse, true);
    }
  }

  async function mount(reuse: boolean) {
    const container = document.createElement("div");
    const renderer = new Renderer();
    const state = renderer.renderInContainer(Table, container);
    const table = state.component as Table;
    table.reuse = reuse;
    await renderer.waitUntilIdle();
    return {
      container,
      table,
      cells: () => [...state.slotChildren.values()].map((child) => child.component as Cell),
      async update(change: (t: Table) => void) {
        change(table);
        table.stateHasChangedInternal();
        await renderer.waitUntilIdle();
      },
    };
  }

  it("the DOM equals a render without reuse after every operation, and unchanged cells get no parameters", async () => {
    const optimized = await mount(true);
    const reference = await mount(false);
    const steps: Array<(t: Table) => void> = [
      (t) => { t.selected = 2; },
      (t) => { t.list = [t.list[3]!, t.list[1]!, t.list[2]!, t.list[0]!]; },
      (t) => { t.list = t.list.filter((r) => r.id !== 2); },
      (t) => { t.list = [{ id: 9, label: "new" }, ...t.list]; },
      (t) => { t.list = t.list.map((r) => (r.id === 3 ? { ...r, label: "changed" } : r)); },
    ];
    for (const step of steps) {
      await optimized.update(step);
      await reference.update(step);
      expect(optimized.container.innerHTML).toBe(reference.container.innerHTML);
      // Blazor's change detection: a cell whose primitive parameter is unchanged is not set again.
      expect(optimized.cells().map((c) => c.sets).sort()).toEqual(reference.cells().map((c) => c.sets).sort());
    }
    expect(optimized.table.reused).toBeGreaterThan(0);
    expect(optimized.cells().every((c) => c.sets === 1)).toBe(true);
  });
});
