/**
 * TreeView (Fluent UI Blazor's FluentTreeView): the ARIA tree's structure, selection by click and
 * by key, opening and closing, and the keyboard's moves. Mounted through the compiled pipeline.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { renderTree } from "@tsazor/testing";
import { EventCallback } from "@tsazor/runtime";
import { TreeView, type TreeViewItem } from "../dist/index.js";

type Renderer = Pick<Awaited<ReturnType<typeof renderTree>>, "settle">;
async function settle(renderer: Renderer): Promise<void> {
  await renderer.settle();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await renderer.settle();
}

beforeAll(() => {
  document.body.innerHTML = "";
});

const pages: TreeViewItem[] = [
  { id: "home", text: "Home" },
  { id: "blogs", text: "Blogs", items: [{ id: "detail", text: "Detail" }, { id: "archive", text: "Archive" }] },
  { id: "admin", text: "Admin", disabled: true },
];

async function mountTree(selected: TreeViewItem | null) {
  const picked: (TreeViewItem | null)[] = [];
  const mounted = await renderTree((b) => {
    b.openComponent(0, TreeView);
    b.addAttribute(1, "items", pages);
    b.addAttribute(2, "selectedItem", selected);
    b.addAttribute(3, "selectedItemChanged", EventCallback.unbound((item: TreeViewItem | null) => {
      picked.push(item);
    }));
    b.addAttribute(4, "ariaLabel", "Parent page");
    b.closeComponent();
  });
  await mounted.settle();
  const node = (id: string) => mounted.container.querySelector<HTMLElement>(`[data-tree-id="${id}"]`);
  return { ...mounted, picked, node };
}

describe("TreeView", () => {
  it("is an ARIA tree: levels, the selection's ancestors open, one node takes Tab", async () => {
    const { container, node } = await mountTree(pages[1]!.items![1]!);
    expect(container.querySelector("[role=tree]")!.getAttribute("aria-label")).toBe("Parent page");
    expect(node("blogs")!.getAttribute("aria-expanded")).toBe("true");
    expect(node("home")!.hasAttribute("aria-expanded")).toBe(false);
    expect(node("archive")!.getAttribute("aria-level")).toBe("2");
    expect(node("archive")!.getAttribute("aria-selected")).toBe("true");
    expect(node("admin")!.getAttribute("aria-disabled")).toBe("true");
    const tabbable = [...container.querySelectorAll("[role=treeitem]")].filter((item) => item.getAttribute("tabindex") === "0");
    expect(tabbable.map((item) => item.getAttribute("data-tree-id"))).toEqual(["archive"]);
  });

  it("a click selects that node only, the chevron opens and closes, a disabled node isn't selected", async () => {
    const { picked, node, ...renderer } = await mountTree(null);
    expect(node("detail")).toBeNull();
    node("blogs")!.querySelector<HTMLElement>(".tz-tree__chevron")!.click();
    await settle(renderer);
    expect(picked).toEqual([]);
    node("detail")!.click();
    await settle(renderer);
    expect(picked.map((item) => item?.id)).toEqual(["detail"]);
    expect(node("detail")!.getAttribute("aria-selected")).toBe("true");
    expect(node("blogs")!.getAttribute("aria-selected")).toBe("false");
    node("admin")!.click();
    await settle(renderer);
    expect(picked.map((item) => item?.id)).toEqual(["detail"]);
  });

  it("the keyboard: Down moves the focus, Right opens, Enter selects", async () => {
    const { container, picked, node, ...renderer } = await mountTree(null);
    const tree = container.querySelector<HTMLElement>("[role=tree]")!;
    const press = async (key: string) => {
      tree.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      await settle(renderer);
    };
    await press("ArrowDown");
    expect(document.activeElement).toBe(node("blogs"));
    expect(node("blogs")!.getAttribute("tabindex")).toBe("0");
    await press("ArrowRight");
    expect(node("blogs")!.getAttribute("aria-expanded")).toBe("true");
    await press("ArrowRight");
    expect(document.activeElement).toBe(node("detail"));
    await press("Enter");
    expect(picked.map((item) => item?.id)).toEqual(["detail"]);
    await press("ArrowLeft");
    expect(document.activeElement).toBe(node("blogs"));
  });
});
