/**
 * The captured attributes (`additionalAttributes`) of a component, with its own
 * classes merged in: `<Button class="delete">` keeps `btn btn-primary` and adds
 * `delete` (an attribute splatted after `class` would replace it).
 */
export function withClass(classes: string | null | undefined, attributes: Record<string, unknown> | undefined): Record<string, unknown> {
  const extra = attributes?.["class"];
  const merged = [classes, typeof extra === "string" ? extra : null].filter((part): part is string => !!part).join(" ");
  return { ...attributes, class: merged.length > 0 ? merged : null };
}
