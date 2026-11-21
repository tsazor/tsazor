import { describe, expect, it } from "vitest";
import { initiallyExpanded, treeKeyAction, treePath, treeTabStop, visibleTreeItems, type TreeViewItem } from "../src/tree";

const tree: TreeViewItem[] = [
  { id: "home", text: "Home" },
  {
    id: "blogs",
    text: "Blogs",
    expanded: true,
    items: [
      { id: "detail", text: "Detail" },
      { id: "archive", text: "Archive", items: [{ id: "2025", text: "2025" }] },
    ],
  },
  { id: "admin", text: "Admin", disabled: true, items: [{ id: "roles", text: "Roles" }] },
];

describe("the tree model", () => {
  it("shows a closed node's children only once it opens", () => {
    const expanded = initiallyExpanded(tree);
    expect([...expanded]).toEqual(["blogs"]);
    expect(visibleTreeItems(tree, expanded).map((node) => `${node.item.id}@${node.level}`)).toEqual(["home@1", "blogs@1", "detail@2", "archive@2", "admin@1"]);
    expect(visibleTreeItems(tree, new Set(["blogs", "archive"])).map((node) => node.item.id)).toContain("2025");
  });

  it("keeps one tab stop: a hidden candidate gives it to its visible ancestor, a missing one to the next", () => {
    const blogsOpen = new Set(["blogs"]);
    expect(treeTabStop(tree, blogsOpen, ["detail", "home"])).toBe("detail");
    expect(treeTabStop(tree, blogsOpen, ["2025"])).toBe("archive");
    expect(treeTabStop(tree, new Set(), ["2025"])).toBe("blogs");
    expect(treeTabStop(tree, blogsOpen, ["gone", "admin"])).toBe("admin");
    expect(treeTabStop(tree, blogsOpen, [undefined, "gone"])).toBe("home");
    expect(treeTabStop([], blogsOpen, ["home"])).toBeUndefined();
  });

  it("finds an item's ancestors", () => {
    expect(treePath(tree, "2025")).toEqual(["blogs", "archive"]);
    expect(treePath(tree, "home")).toEqual([]);
    expect(treePath(tree, "nowhere")).toBeUndefined();
  });
});

describe("the tree's keys (ARIA tree pattern)", () => {
  const expanded = new Set(["blogs"]);
  const key = (focused: string, pressed: string) => treeKeyAction(tree, expanded, focused, pressed);

  it("Down and Up walk the visible nodes", () => {
    expect(key("blogs", "ArrowDown")).toEqual({ kind: "focus", id: "detail" });
    expect(key("archive", "ArrowDown")).toEqual({ kind: "focus", id: "admin" });
    expect(key("admin", "ArrowDown")).toBeNull();
    expect(key("detail", "ArrowUp")).toEqual({ kind: "focus", id: "blogs" });
  });

  it("Right opens a closed node, then moves into it; Left closes, then moves to the parent", () => {
    expect(key("archive", "ArrowRight")).toEqual({ kind: "expand", id: "archive" });
    expect(key("blogs", "ArrowRight")).toEqual({ kind: "focus", id: "detail" });
    expect(key("home", "ArrowRight")).toBeNull();
    expect(key("blogs", "ArrowLeft")).toEqual({ kind: "collapse", id: "blogs" });
    expect(key("detail", "ArrowLeft")).toEqual({ kind: "focus", id: "blogs" });
    expect(key("home", "ArrowLeft")).toBeNull();
  });

  it("Home and End jump; Enter and Space select, but not a disabled node", () => {
    expect(key("archive", "Home")).toEqual({ kind: "focus", id: "home" });
    expect(key("home", "End")).toEqual({ kind: "focus", id: "admin" });
    expect(key("detail", "Enter")).toEqual({ kind: "select", id: "detail" });
    expect(key("detail", " ")).toEqual({ kind: "select", id: "detail" });
    expect(key("admin", "Enter")).toBeNull();
    expect(key("home", "x")).toBeNull();
  });
});
