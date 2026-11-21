import type { ComponentMetadata, ComponentParameter, ParameterCategory } from "../src/metadata";

/** Parameter metadata of a test component: `{ value: "value", onClick: "EventCallback" }`. */
export function metadataOf(
  name: string,
  parameters: Record<string, ParameterCategory | Partial<ComponentParameter>>,
  extra: Partial<ComponentMetadata> = {},
): ComponentMetadata {
  return {
    name,
    isComponent: true,
    typeParameters: [],
    parameters: Object.entries(parameters).map(([parameter, spec]) => ({
      name: parameter,
      category: "value",
      optional: true,
      hasInitializer: false,
      member: "field",
      declaredBy: name,
      ...(typeof spec === "string" ? { category: spec } : spec),
    })),
    ...extra,
  };
}

/** Compile options resolving every tag in `components` (as `./<Tag>.tsazor`) with its metadata. */
export function withComponents(components: Record<string, ComponentMetadata | null>) {
  return {
    resolveComponent: (tag: string) => (tag in components ? { specifier: `./${tag}.tsazor` } : null),
    resolveComponentMetadata: (tag: string) => components[tag] ?? null,
  };
}
