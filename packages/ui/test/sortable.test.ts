import { afterEach, describe, expect, it } from "vitest";
import { moveItem, sortableInsertIndex, sortableList, sortableListLabels, type SortableListEventArgs } from "../src/sortable.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  document.body.innerHTML = "";
});

/** A list as a component keeps it: the items, a render, the events and what it said. */
function makeList(id: string, names: string[], group?: string) {
  const element = document.createElement("ul");
  document.body.append(element);
  const state = { items: [...names], said: [] as string[], updates: [] as SortableListEventArgs[], adds: [] as SortableListEventArgs[], removes: [] as SortableListEventArgs[] };
  const render = (): void => {
    element.replaceChildren(...state.items.map((name, index) => {
      const item = document.createElement("li");
      item.setAttribute("data-sortable-index", String(index));
      item.textContent = name;
      return item;
    }));
  };
  render();
  const detach = sortableList(() => ({
    id,
    group,
    clone: false,
    drop: true,
    sort: true,
    orientation: "vertical",
    name: id,
    labels: sortableListLabels,
    count: state.items.length,
    isFixed: (index) => state.items[index] === "Fixed",
    itemAt: (index) => state.items[index],
    move: async (from, to) => {
      state.items = moveItem(state.items, from, to);
      render();
    },
    remove: async (index, args) => {
      state.items = state.items.filter((_, at) => at !== index);
      state.removes.push(args);
      render();
    },
    add: async (item, index, args) => {
      state.items = [...state.items.slice(0, index), item as string, ...state.items.slice(index)];
      state.adds.push(args);
      render();
    },
    announce: (text) => void state.said.push(text),
  }), { indicatorClass: "indicator" })(element);
  if (typeof detach === "function") cleanups.push(detach);
  const item = (index: number) => element.querySelector<HTMLElement>(`[data-sortable-index="${index}"]`)!;
  return { element, state, item };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 40));
const press = async (key: string): Promise<void> => {
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await settle();
};

describe("moveItem and sortableInsertIndex", () => {
  it("moves an item", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("inserts before the first item whose center is past the pointer", () => {
    const rects = [0, 40, 80].map((top) => new DOMRect(0, top, 100, 40));
    expect(sortableInsertIndex(rects, { x: 50, y: 10 }, "vertical")).toBe(0);
    expect(sortableInsertIndex(rects, { x: 50, y: 70 }, "vertical")).toBe(2);
    expect(sortableInsertIndex(rects, { x: 50, y: 200 }, "vertical")).toBe(3);
    expect(sortableInsertIndex([new DOMRect(0, 0, 50, 20), new DOMRect(50, 0, 50, 20)], { x: 60, y: 5 }, "horizontal")).toBe(1);
  });
});

describe("sortableList, the keys", () => {
  it("is one tab stop; the arrow keys move the focus", async () => {
    const { item } = makeList("bread", ["Rye", "Spelt", "Wheat"]);
    expect([0, 1, 2].map((index) => item(index).tabIndex)).toEqual([0, -1, -1]);
    item(0).focus();
    await press("ArrowDown");
    expect(document.activeElement).toBe(item(1));
    await press("End");
    expect(document.activeElement).toBe(item(2));
    expect([0, 1, 2].map((index) => item(index).tabIndex)).toEqual([-1, -1, 0]);
  });

  it("Space picks an item up, the arrows move it, Space puts it down, saying so", async () => {
    const { state, item } = makeList("bread", ["Rye", "Spelt", "Wheat"]);
    item(0).focus();
    await press(" ");
    expect(item(0).hasAttribute("data-sortable-grabbed")).toBe(true);
    expect(state.said.at(-1)).toBe("Rye, picked up. Position 1 of 3.");
    await press("ArrowDown");
    await press("ArrowDown");
    expect(state.items).toEqual(["Spelt", "Wheat", "Rye"]);
    expect(document.activeElement).toBe(item(2));
    expect(item(2).hasAttribute("data-sortable-grabbed")).toBe(true);
    expect(state.said.at(-1)).toBe("Rye, position 3 of 3.");
    await press(" ");
    expect(item(2).hasAttribute("data-sortable-grabbed")).toBe(false);
    expect(state.said.at(-1)).toBe("Rye, put down at position 3 of 3.");
  });

  it("keys in quick succession (a held arrow key) act in turn on the held item", async () => {
    const { state, item } = makeList("bread", ["Rye", "Spelt", "Wheat", "Oat"]);
    item(0).focus();
    for (const key of [" ", "ArrowDown", "ArrowDown", "ArrowDown", " "]) {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(state.items).toEqual(["Spelt", "Wheat", "Oat", "Rye"]);
    expect(state.said.at(-1)).toBe("Rye, put down at position 4 of 4.");
  });

  it("Escape puts it back where it was", async () => {
    const { state, item } = makeList("bread", ["Rye", "Spelt", "Wheat"]);
    item(1).focus();
    await press("Enter");
    await press("ArrowUp");
    expect(state.items).toEqual(["Spelt", "Rye", "Wheat"]);
    await press("Escape");
    expect(state.items).toEqual(["Rye", "Spelt", "Wheat"]);
    expect(document.activeElement).toBe(item(1));
    expect(state.said.at(-1)).toBe("Spelt, put back.");
  });

  it("across to the next list of the group, and back with Escape", async () => {
    const left = makeList("Shelf", ["Rye", "Spelt"], "bakery");
    const right = makeList("Basket", ["Wheat"], "bakery");
    left.item(1).focus();
    await press(" ");
    await press("ArrowRight");
    expect(left.state.items).toEqual(["Rye"]);
    expect(right.state.items).toEqual(["Wheat", "Spelt"]);
    expect(right.state.adds[0]).toMatchObject({ oldIndex: 1, newIndex: 1, fromListId: "Shelf", toListId: "Basket" });
    expect(document.activeElement).toBe(right.item(1));
    expect(right.state.said.at(-1)).toBe("Spelt, moved to Basket, position 2 of 2.");
    await press("Escape");
    expect(left.state.items).toEqual(["Rye", "Spelt"]);
    expect(right.state.items).toEqual(["Wheat"]);
  });

  it("keys in quick succession follow the item across to the next list", async () => {
    const left = makeList("Shelf", ["Rye", "Spelt"], "bakery");
    const right = makeList("Basket", ["Wheat"], "bakery");
    left.item(0).focus();
    for (const key of [" ", "ArrowRight", "ArrowDown", " "]) {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(left.state.items).toEqual(["Spelt"]);
    expect(right.state.items).toEqual(["Wheat", "Rye"]);
    expect(right.state.said.at(-1)).toBe("Rye, put down at position 2 of 2.");
  });

  it("a key that lands outside the lists while the item moves over still belongs to it", async () => {
    const left = makeList("Shelf", ["Rye", "Spelt"], "bakery");
    const right = makeList("Basket", ["Wheat"], "bakery");
    left.item(0).focus();
    for (const key of [" ", "ArrowRight"]) {
      left.item(0).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    }
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(right.state.items).toEqual(["Rye", "Wheat"]);
    expect(right.state.said.at(-1)).toBe("Rye, put down at position 1 of 2.");
  });

  it("an item the filter fixes can't be picked up", async () => {
    const { state, item } = makeList("bread", ["Fixed", "Spelt"]);
    item(0).focus();
    await press(" ");
    expect(item(0).hasAttribute("data-sortable-grabbed")).toBe(false);
    expect(state.said).toEqual([]);
  });
});
