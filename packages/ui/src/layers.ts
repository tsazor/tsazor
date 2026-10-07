/**
 * The open overlay layers (dialogs, menus, popovers), in the order they
 * opened. Only the topmost one reacts to Escape, outside clicks and the
 * focus trap's Tab handling — a menu inside a dialog closes first, then the
 * dialog.
 */
const stack: object[] = [];

/** Opens a layer; returns the function that closes it again. */
export function openLayer(layer: object): () => void {
  stack.push(layer);
  return () => {
    const index = stack.lastIndexOf(layer);
    if (index >= 0) stack.splice(index, 1);
  };
}

/** Whether `layer` is the topmost open layer. */
export function isTopLayer(layer: object): boolean {
  return stack[stack.length - 1] === layer;
}
