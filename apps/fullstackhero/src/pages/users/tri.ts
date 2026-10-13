/** pages/users/list.tsx's tri-state filter (the status and email filters): any, yes or no. */
export type Tri = "any" | "yes" | "no";

/** The filter as the search's optional boolean: undefined for "any". */
export function triToBool(v: Tri): boolean | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  return undefined;
}
