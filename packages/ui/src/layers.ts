/**
 * The open overlay layers (dialogs, menus, popovers), in the order they
 * opened. Only the topmost one reacts to Escape, outside clicks and the
 * focus trap's Tab handling — a menu inside a dialog closes first, then the
 * dialog.
 *
 * A layer is identified by a key object. The behaviors of one overlay (a
 * dialog's focus trap and its dismiss handling) pass the same key, so they
 * count as one layer; DOM nesting can't tell "part of the same overlay" from
 * "an overlay opened inside it".
 */
const stack: Array<{ key: object; count: number }> = [];

/** Opens (or joins) the layer `key`; returns the function that leaves it again. */
export function openLayer(key: object): () => void {
  const entry = stack.find((candidate) => candidate.key === key);
  if (entry) entry.count++;
  else stack.push({ key, count: 1 });
  let open = true;
  return () => {
    if (!open) return;
    open = false;
    const index = stack.findIndex((candidate) => candidate.key === key);
    if (index >= 0 && --stack[index]!.count === 0) stack.splice(index, 1);
  };
}

/** Whether `key` is the topmost open layer. */
export function isTopLayer(key: object): boolean {
  return stack[stack.length - 1]?.key === key;
}

/** A fresh layer key, for the behaviors of one overlay to share. */
export function createLayer(): object {
  return {};
}
