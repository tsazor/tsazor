/**
 * Overflow (Fluent UI Blazor's FluentOverflow): how many items of a row (or a column) fit, the rest behind a "+N"
 * button. Pure, so both skins measure the same way.
 */

/**
 * How many items fit into `available` px: all of them when their sizes and gaps fit, else as many as fit beside the
 * "+N" button (`more` px and a gap). At least none.
 */
export function overflowFit(sizes: readonly number[], available: number, more: number, gap = 0): number {
  const total = sizes.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, sizes.length - 1);
  if (total <= available + 0.5) return sizes.length;
  const room = available - more - gap;
  let used = 0;
  let count = 0;
  for (const size of sizes) {
    const next = used + (count > 0 ? gap : 0) + size;
    if (next > room + 0.5) break;
    used = next;
    count++;
  }
  return count;
}
