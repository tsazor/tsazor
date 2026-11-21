import type { TreeViewItem } from "@tsazor/ui";

/** What a TreeViewNode asks of its TreeView: the tree's state and its two actions. */
export interface TreeHost {
    isExpanded(item: TreeViewItem): boolean;
    isSelected(item: TreeViewItem): boolean;
    /** The one node that takes Tab (roving tabindex). */
    isFocusable(item: TreeViewItem): boolean;
    select(item: TreeViewItem): Promise<void> | undefined;
    toggle(item: TreeViewItem): void;
}
