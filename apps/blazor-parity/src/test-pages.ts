/**
 * The test pages, named after the Razor components they port. Blazor's BasicTestApp mounts a test component
 * by choosing its name in a select; the index page here does the same, so a test mounts a page with
 * `mount(page, "VirtualizationAnchorMode")` as Blazor's does with `MountTestComponent<VirtualizationAnchorMode>()`.
 */
export interface TestPage {
  readonly name: string;
  readonly route: string;
}

export const testPages: readonly TestPage[] = [
  { name: "VirtualizationAnchorMode", route: "/virtualization/anchor-mode" },
  { name: "VirtualizationAnchorModeWindowScroll", route: "/virtualization/anchor-mode-window-scroll" },
  { name: "VirtualizationBimodal", route: "/virtualization/bimodal" },
  { name: "VirtualizationChatListAsync", route: "/virtualization/chat-list-async" },
  { name: "VirtualizationComponent", route: "/virtualization/component" },
  { name: "VirtualizationCsp", route: "/virtualization/csp" },
  { name: "VirtualizationDataChanges", route: "/virtualization/data-changes" },
  { name: "VirtualizationDisplayModes", route: "/virtualization/display-modes" },
  { name: "VirtualizationDynamicContent", route: "/virtualization/dynamic-content" },
  { name: "VirtualizationHorizontalOverflow", route: "/virtualization/horizontal-overflow" },
  { name: "VirtualizationLargeOverscan", route: "/virtualization/large-overscan" },
  { name: "VirtualizationMaxItemCount", route: "/virtualization/max-item-count" },
  { name: "VirtualizationMaxItemCount_AppContext", route: "/virtualization/max-item-count-app-context" },
  { name: "VirtualizationNestedVariableHeight", route: "/virtualization/nested-variable-height" },
  { name: "VirtualizationScrollBehavior", route: "/virtualization/scroll-behavior" },
  { name: "VirtualizationTable", route: "/virtualization/table" },
  { name: "VirtualizationTableScrollWithAppend", route: "/virtualization/table-scroll-with-append" },
  { name: "VirtualizationVariableHeight", route: "/virtualization/variable-height" },
  { name: "VirtualizationVariableHeightAsync", route: "/virtualization/variable-height-async" },
  { name: "VirtualizationVariableHeightTable", route: "/virtualization/variable-height-table" },
  // Blazor's BasicTestApp.FormsTest pages.
  { name: "InputFileComponent", route: "/forms/input-file" },
  // Blazor's BasicTestApp.QuickGridTest pages, against the DataGrid of the build's skin (vite.config.ts).
  { name: "QuickGridAnchorModeComponent", route: "/quickgrid/anchor-mode" },
  { name: "QuickGridScrollComponent", route: "/quickgrid/scroll" },
  { name: "QuickGridVariableHeightComponent", route: "/quickgrid/variable-height" },
  { name: "QuickGridVirtualizeCapacityComponent", route: "/quickgrid/virtualize-capacity" },
  { name: "QuickGridVirtualizeComponent", route: "/quickgrid/virtualize" },
];
