let counter = 0;

/**
 * A unique element id (`<prefix>-<n>`, unique per app run) — for `for`,
 * `aria-labelledby`, `aria-controls` and `aria-describedby` when the app gives
 * no id. Blazor's InputBase generates ids the same way.
 */
export function uniqueId(prefix = "tz"): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
