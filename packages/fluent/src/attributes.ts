/**
 * Shared pass-through helper for the `@attributes` capture parameter
 * (`@Parameter({ captureUnmatchedValues: true }) additionalAttributes`):
 * a component merges the attributes its caller did not bind under its own
 * element attributes. `class` appends (never replaces) — markup stays in
 * control of the Fluent classes, users add to them.
 */

/**
 * Merges user pass-through attributes onto the component's own values.
 * Entry order: component values first, user attributes win; `class` values
 * combine. Unset (`undefined`/`null`) component values render nothing
 * (the DOM renderer's conditional-attribute semantics).
 */
export function withAttributes(
  self: Record<string, unknown>,
  additional?: Record<string, unknown>,
): Record<string, unknown> {
  if (additional === undefined) return self;
  const merged: Record<string, unknown> = { ...self };
  for (const [name, value] of Object.entries(additional)) {
    const both = name.toLowerCase() === "class";
    merged[name] = both && typeof merged[name] === "string" && typeof value === "string"
      ? `${merged[name]} ${value}`
      : value;
  }
  return merged;
}