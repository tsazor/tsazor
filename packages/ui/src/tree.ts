/**
 * The tree view's model (Fluent UI Blazor's ITreeViewItem) and its keyboard, after the ARIA tree
 * pattern: pure functions both skins share.
 */
import type { IconValue } from "./icons.js";

/** A node of a tree view. */
export interface TreeViewItem {
  /** Unique among the tree's items. */
  readonly id: string;
  /** The text the node shows. */
  readonly text: string;
  /** The node's children; none or empty for a leaf. */
  readonly items?: readonly TreeViewItem[] | null;
  /** Open when the tree first shows it. */
  readonly expanded?: boolean;
  /** Shown, but can't be selected. */
  readonly disabled?: boolean;
  /** An icon before the text (Fluent UI Blazor's `IconStart`; 16px recommended). */
  readonly iconStart?: IconValue;
  /** An icon after the text (`IconEnd`). */
  readonly iconEnd?: IconValue;
  /** Replaces the chevron while the node is closed (`IconCollapsed`), e.g. a folder. */
  readonly iconCollapsed?: IconValue;
  /** Replaces the chevron while the node is open (`IconExpanded`), e.g. an open folder. */
  readonly iconExpanded?: IconValue;
}

/** A visible node: the item, its depth (1 at the top) and its parent's id. */
export interface VisibleTreeItem {
  readonly item: TreeViewItem;
  readonly level: number;
  readonly parentId: string | undefined;
}

/** The ids of the items that start open (`expanded`), at any depth. */
export function initiallyExpanded(items: readonly TreeViewItem[]): Set<string> {
  const expanded = new Set<string>();
  const walk = (nodes: readonly TreeViewItem[]): void => {
    for (const node of nodes) {
      if (node.expanded) expanded.add(node.id);
      walk(node.items ?? []);
    }
  };
  walk(items);
  return expanded;
}

/** True when the item has children. */
export function hasChildren(item: TreeViewItem): boolean {
  return (item.items?.length ?? 0) > 0;
}

/** The visible nodes in reading order: a closed node hides its children. */
export function visibleTreeItems(items: readonly TreeViewItem[], expanded: ReadonlySet<string>): VisibleTreeItem[] {
  const visible: VisibleTreeItem[] = [];
  const walk = (nodes: readonly TreeViewItem[], level: number, parentId: string | undefined): void => {
    for (const item of nodes) {
      visible.push({ item, level, parentId });
      if (hasChildren(item) && expanded.has(item.id)) walk(item.items!, level + 1, item.id);
    }
  };
  walk(items, 1, undefined);
  return visible;
}

/** The ids of the item's ancestors, outermost first; undefined when the tree doesn't have it. */
export function treePath(items: readonly TreeViewItem[], id: string): string[] | undefined {
  for (const item of items) {
    if (item.id === id) return [];
    const below = treePath(item.items ?? [], id);
    if (below !== undefined) return [item.id, ...below];
  }
  return undefined;
}

/** What a key does in a tree: move the focus, open or close a node, or select one. */
export type TreeKeyAction =
  | { readonly kind: "focus"; readonly id: string }
  | { readonly kind: "expand"; readonly id: string }
  | { readonly kind: "collapse"; readonly id: string }
  | { readonly kind: "select"; readonly id: string };

/**
 * The ARIA tree pattern's keys for the focused node: Down/Up move through the visible nodes,
 * Right opens a closed node or moves into an open one, Left closes an open node or moves to the
 * parent, Home/End go to the first/last visible node, Enter/Space select. Null for any other key.
 */
export function treeKeyAction(
  items: readonly TreeViewItem[],
  expanded: ReadonlySet<string>,
  focusedId: string,
  key: string,
): TreeKeyAction | null {
  const visible = visibleTreeItems(items, expanded);
  const index = visible.findIndex((node) => node.item.id === focusedId);
  if (index < 0) return visible.length > 0 ? { kind: "focus", id: visible[0]!.item.id } : null;
  const current = visible[index]!;
  switch (key) {
    case "ArrowDown":
      return index + 1 < visible.length ? { kind: "focus", id: visible[index + 1]!.item.id } : null;
    case "ArrowUp":
      return index > 0 ? { kind: "focus", id: visible[index - 1]!.item.id } : null;
    case "ArrowRight":
      if (!hasChildren(current.item)) return null;
      return expanded.has(current.item.id)
        ? { kind: "focus", id: current.item.items![0]!.id }
        : { kind: "expand", id: current.item.id };
    case "ArrowLeft":
      if (hasChildren(current.item) && expanded.has(current.item.id)) return { kind: "collapse", id: current.item.id };
      return current.parentId !== undefined ? { kind: "focus", id: current.parentId } : null;
    case "Home":
      return { kind: "focus", id: visible[0]!.item.id };
    case "End":
      return { kind: "focus", id: visible[visible.length - 1]!.item.id };
    case "Enter":
    case " ":
      return current.item.disabled ? null : { kind: "select", id: current.item.id };
    default:
      return null;
  }
}
