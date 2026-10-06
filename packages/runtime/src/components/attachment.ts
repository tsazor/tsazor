import { FrameType } from "../render-tree/frame-type.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { ComponentState } from "../renderer/component-state.js";
import { installAttachmentHost, type AttachmentHost } from "../renderer/attachment-host.js";

/**
 * A function attached to an element with `@attach` (Svelte 5's attachments):
 * it receives the element once the element is in the DOM and may return a
 * cleanup function, which runs when the element is removed, the component is
 * disposed, or the attachment is replaced by another value.
 *
 * ```razor
 * <input @attach="autofocus" />
 * <button @attach="tooltip" @attach:shortcut="saveShortcut">Save</button>
 *
 * @code {
 *   autofocus: Attachment<HTMLInputElement> = (input) => input.focus();
 * }
 * ```
 *
 * Attachments run after the render batch's DOM edits, in the same phase as
 * `onAfterRender` (before those calls), in document order within a
 * component. An attachment is compared by identity: the same function on the
 * next render does nothing; a different one cleans up the old attachment and
 * runs the new one; `null`, `undefined` or `false` means no attachment. A
 * factory call in markup (`@attach="tooltip('Save')"`) creates a new
 * function every render and so re-attaches every render — memoize the
 * factory or keep the attachment in a field. An exception thrown by an
 * attachment or its cleanup is a failure of the component (the nearest
 * `ErrorBoundary` handles it, as for `onAfterRender`).
 */
export type Attachment<E extends Element = Element> = (element: E) => void | (() => void);

/**
 * Adds the attachment frame of an `@attach` (F2) to the open element — what
 * the compiler emits for `@attach="…"` (`name` `"@attach"`) and
 * `@attach:<name>="…"` (`name` `"@attach:<name>"`). Each name on an element
 * is one independent attachment. `null`, `undefined` and `false` attach
 * nothing.
 */
export function addAttachment<E extends Element = Element>(
  builder: RenderTreeBuilder,
  sequence: number,
  name: string,
  value: Attachment<E> | null | undefined | false,
): void {
  installAttachmentHost(host);
  builder.getFrames().push({ frameType: FrameType.Attachment, sequence, attributeName: name, attributeValue: value });
}

/** A live attachment: the function that ran and the cleanup it returned. */
interface Live {
  readonly value: unknown;
  cleanup: (() => void) | undefined;
}

/** Per component: its elements with live attachments, by attachment name. */
const live = new WeakMap<ComponentState, Map<Element, Map<string, Live>>>();

type Fail = (error: unknown, state: ComponentState) => void;

const host: AttachmentHost = {
  run(work, fail) {
    for (let i = 0; i < work.length; i += 4) {
      const state = work[i] as ComponentState;
      // A disposed component's attachments were cleaned up with it.
      if (state.disposed) continue;
      const element = work[i + 1] as Element | null;
      let elements = live.get(state);
      if (element === null) {
        if (elements !== undefined) sweep(state, elements, fail);
        continue;
      }
      const name = work[i + 2] as string;
      const value = work[i + 3];
      const byName = elements?.get(element);
      const current = byName?.get(name);
      if (current !== undefined) {
        // Changed and changed back within one batch: still attached.
        if (current.value === value) continue;
        byName!.delete(name);
        if (byName!.size === 0) elements!.delete(element);
        cleanUp(current, state, fail);
      }
      // Removed again later in the batch: never attached (nothing to clean up).
      if (typeof value !== "function" || !isMounted(state, element)) continue;
      const entry: Live = { value, cleanup: undefined };
      if (elements === undefined) live.set(state, (elements = new Map()));
      let names = elements.get(element);
      if (names === undefined) elements.set(element, (names = new Map()));
      names.set(name, entry);
      try {
        const cleanup = (value as Attachment)(element);
        if (typeof cleanup === "function") entry.cleanup = cleanup;
      } catch (error) {
        fail(error, state);
      }
    }
  },
  dispose(state, fail) {
    const elements = live.get(state);
    if (elements === undefined) return;
    live.delete(state);
    for (const names of elements.values()) {
      for (const entry of names.values()) cleanUp(entry, state, fail);
    }
  },
};

/** Cleans up the attachments of `state`'s elements that are no longer in its DOM. */
function sweep(state: ComponentState, elements: Map<Element, Map<string, Live>>, fail: Fail): void {
  for (const [element, names] of elements) {
    if (isMounted(state, element)) continue;
    elements.delete(element);
    for (const entry of names.values()) cleanUp(entry, state, fail);
  }
  if (elements.size === 0) live.delete(state);
}

/** Whether `element` is still part of the component's DOM (inside the node holding its range). */
function isMounted(state: ComponentState, element: Element): boolean {
  const parent = state.range.start.parentNode;
  return parent !== null && parent.contains(element);
}

function cleanUp(entry: Live, state: ComponentState, fail: Fail): void {
  const cleanup = entry.cleanup;
  if (cleanup === undefined) return;
  entry.cleanup = undefined;
  try {
    cleanup();
  } catch (error) {
    fail(error, state);
  }
}
