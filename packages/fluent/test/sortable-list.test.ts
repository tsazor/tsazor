/**
 * SortableList (Fluent UI Blazor's FluentSortableList): a list of templated items, one tab stop, the keyboard way to
 * reorder (bound items and onUpdate follow, a screen reader hears it), two lists of a group trading an item, a fixed
 * item.
 */
import { afterEach, describe, expect, it } from "vitest";
import { render, type RenderResult } from "@tsazor/testing";
import { ComponentBase, EventCallback, type RenderTreeBuilder } from "@tsazor/runtime";
import type { SortableListEventArgs } from "@tsazor/ui";
import { SortableList } from "../dist/index.js";

const PREFIX = "fui";

const hosts: RenderResult[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.dispose();
  document.body.innerHTML = "";
});

/** Two lists of one group, bound to `shelf` and `basket`. */
class Host extends ComponentBase {
  static last: Host | undefined;
  shelf = ["Rye", "Spelt", "Wheat"];
  basket = ["Pretzel"];
  updates: SortableListEventArgs[] = [];
  adds: SortableListEventArgs[] = [];
  protected override buildRenderTree(b: RenderTreeBuilder): void {
    Host.last = this;
    const list = (seq: number, name: string, items: string[], set: (items: string[]) => void) => {
      b.openComponent(seq, SortableList);
      b.addAttribute(seq + 1, "items", items);
      b.addAttribute(seq + 2, "itemsChanged", EventCallback.bind(this, set));
      b.addAttribute(seq + 3, "itemTemplate", (item: string) => (t: RenderTreeBuilder) => t.addContent(0, item));
      b.addAttribute(seq + 4, "ariaLabel", name);
      b.addAttribute(seq + 5, "group", "bakery");
      b.addAttribute(seq + 6, "itemFilter", (item: string) => item === "Pretzel");
      b.addAttribute(seq + 7, "onUpdate", EventCallback.bind(this, (args: SortableListEventArgs) => void this.updates.push(args)));
      b.addAttribute(seq + 8, "onAdd", EventCallback.bind(this, (args: SortableListEventArgs) => void this.adds.push(args)));
      b.addAttribute(seq + 9, "id", name.toLowerCase());
      b.closeComponent();
    };
    list(0, "Shelf", this.shelf, (items) => void (this.shelf = items));
    list(20, "Basket", this.basket, (items) => void (this.basket = items));
  }
}

const settle = (result: RenderResult) => new Promise((resolve) => setTimeout(resolve, 50)).then(() => result.settle());

async function press(key: string, result: RenderResult): Promise<void> {
  document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await settle(result);
}

async function mount() {
  const result = await render(Host);
  hosts.push(result);
  const list = (name: string) => result.container.querySelector<HTMLElement>(`ul[aria-label="${name}"]`)!;
  const texts = (name: string) => [...list(name).querySelectorAll("li")].map((li) => li.textContent);
  const status = () => result.container.querySelector("[role=status]")!.textContent;
  return { result, list, texts, status };
}

describe("SortableList", () => {
  it("draws its items, one tab stop, described by the keys' instructions", async () => {
    const { list, texts } = await mount();
    expect(texts("Shelf")).toEqual(["Rye", "Spelt", "Wheat"]);
    const shelf = list("Shelf");
    expect(shelf.getAttribute("role")).toBe("list");
    expect(shelf.id).toBe("shelf");
    const items = [...shelf.querySelectorAll("li")];
    expect(items.map((li) => li.tabIndex)).toEqual([0, -1, -1]);
    expect(document.getElementById(items[0]!.getAttribute("aria-describedby")!)!.textContent).toContain("Press Space to pick the item up");
    expect(list("Basket").querySelector("li")!.className).toBe(`${PREFIX}-sortable-list__item ${PREFIX}-sortable-list__item--fixed`);
  });

  it("the keys reorder the bound items; onUpdate and a screen reader hear it", async () => {
    const { result, list, texts, status } = await mount();
    list("Shelf").querySelector("li")!.focus();
    await press(" ", result);
    expect(status()).toBe("Rye, picked up. Position 1 of 3.");
    await press("ArrowDown", result);
    await press(" ", result);
    expect(Host.last!.shelf).toEqual(["Spelt", "Rye", "Wheat"]);
    expect(texts("Shelf")).toEqual(["Spelt", "Rye", "Wheat"]);
    expect(Host.last!.updates[0]).toMatchObject({ oldIndex: 0, newIndex: 1, fromListId: "shelf", toListId: "shelf" });
    expect(status()).toBe("Rye, put down at position 2 of 3.");
  });

  it("an item moves across to the next list of its group", async () => {
    const { result, list, texts } = await mount();
    list("Shelf").querySelectorAll("li")[2]!.focus();
    await press(" ", result);
    await press("ArrowRight", result);
    await press(" ", result);
    expect(Host.last!.shelf).toEqual(["Rye", "Spelt"]);
    expect(Host.last!.basket).toEqual(["Pretzel", "Wheat"]);
    expect(texts("Basket")).toEqual(["Pretzel", "Wheat"]);
    expect(Host.last!.adds[0]).toMatchObject({ oldIndex: 2, newIndex: 1, fromListId: "shelf", toListId: "basket" });
  });

  it("a fixed item can't be picked up", async () => {
    const { result, list, status } = await mount();
    list("Basket").querySelector("li")!.focus();
    await press(" ", result);
    expect(list("Basket").querySelector("li")!.hasAttribute("data-sortable-grabbed")).toBe(false);
    expect(status()).toBe("");
  });
});
