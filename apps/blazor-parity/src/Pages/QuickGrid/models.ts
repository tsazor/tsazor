/**
 * The row types of Blazor's QuickGrid test pages (their nested C# classes; TypeScript has no nested classes).
 * Their properties stay mutable where the pages mutate them.
 */

/** QuickGridAnchorModeComponent. */
export interface AnchorItem {
  index: number;
}

/** QuickGridScrollComponent. */
export interface ScrollRow {
  index: number;
  height: number;
}

/** QuickGridVariableHeightComponent and QuickGridVirtualizeCapacityComponent (a person with a description). */
export interface DescribedPerson {
  id: number;
  name: string;
  description: string;
}

/** QuickGridVirtualizeComponent. */
export interface Person {
  id: number;
  name: string;
}

