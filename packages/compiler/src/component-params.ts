import type { ComponentMetadata, ComponentParameter } from "./metadata.js";

/**
 * Lookups over a target component's parameter metadata for the code
 * generator (2.2): attribute ⇒ parameter matching, "did you mean"
 * suggestions and the reasons metadata cannot decide a lowering.
 */

/**
 * What the code generator knows about the component a tag resolves to.
 * `metadata` is null without a resolver, for an unresolvable target and for a
 * class that is not a component; `complete` = every parameter is known (an
 * attribute matching none is unmatched for sure).
 */
export interface ComponentTarget {
  tag: string;
  metadata: ComponentMetadata | null;
  complete: boolean;
  /** The parameter with `captureUnmatchedValues`. */
  capture?: ComponentParameter;
  /** Why the parameters are unknown or incomplete — set only when a resolver ran. */
  unavailable?: string;
}

export function componentTarget(tag: string, metadata: ComponentMetadata | null, resolverRan: boolean): ComponentTarget {
  if (metadata && !metadata.isComponent && !metadata.incomplete) {
    return { tag, metadata: null, complete: false, ...(resolverRan ? { unavailable: `'${metadata.name}' does not extend ComponentBase` } : {}) };
  }
  if (!metadata) {
    return { tag, metadata: null, complete: false, ...(resolverRan ? { unavailable: "neither a source file nor a package manifest describes it" } : {}) };
  }
  const target: ComponentTarget = { tag, metadata, complete: !metadata.incomplete };
  const capture = metadata.parameters.find((p) => p.category === "captureUnmatchedValues");
  if (capture) target.capture = capture;
  if (metadata.incomplete) {
    target.unavailable = `the base class chain of '${metadata.name}'${metadata.base ? ` ('${metadata.base.name}')` : ""} could not be resolved, so inherited parameters are unknown`;
  }
  return target;
}

/**
 * The parameter an attribute name sets: the exact name, else the
 * case-insensitive match (Blazor; PascalCase markup sets camelCase members) —
 * the runtime's order of lookup.
 */
export function findParameter(metadata: ComponentMetadata, name: string): ComponentParameter | undefined {
  const lower = name.toLowerCase();
  return metadata.parameters.find((p) => p.name === name) ?? metadata.parameters.find((p) => p.name.toLowerCase() === lower);
}

/**
 * The closest settable parameter name for a misspelled attribute (optimal
 * string alignment distance, case-insensitive, within a third of the length;
 * a missing `On` prefix counts as close), spelled in the attribute's case
 * style: `Lable` ⇒ `Label` for a `label` member.
 */
export function suggestParameter(metadata: ComponentMetadata, name: string): string | undefined {
  const lower = name.toLowerCase();
  const limit = Math.max(1, Math.floor(name.length / 3));
  let best: { name: string; distance: number } | undefined;
  for (const parameter of metadata.parameters) {
    if (parameter.cascading || parameter.category === "captureUnmatchedValues") continue;
    const candidate = parameter.name.toLowerCase();
    const distance = candidate === `on${lower}` ? 1 : editDistance(lower, candidate);
    if (distance <= limit && (best === undefined || distance < best.distance)) best = { name: parameter.name, distance };
  }
  if (!best) return undefined;
  return /^[A-Z]/.test(name) ? best.name[0]!.toUpperCase() + best.name.slice(1) : best.name;
}

/** Why an `uncertain` parameter's category could not be decided (warning text). */
export function uncertainReason(parameter: ComponentParameter): string {
  if (parameter.type === undefined) return "it has no type annotation and its initializer is not a literal";
  const imported = parameter.references?.find((ref) => ref.kind === "import");
  if (imported?.specifier !== undefined) {
    return /^[./]/.test(imported.specifier)
      ? `its type '${imported.name}' is imported from '${imported.specifier}', which could not be followed`
      : `its type '${imported.name}' comes from package '${imported.specifier}', which cannot be followed without a type checker`;
  }
  return `its type '${parameter.type}' could not be followed`;
}

/** Optimal string alignment distance (Levenshtein + adjacent transpositions). */
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, d[i - 2]![j - 2]! + 1);
      d[i]![j] = value;
    }
  }
  return d[a.length]![b.length]!;
}
