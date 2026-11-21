import type { ComponentState } from "./component-state.js";

/**
 * F2 `@attach`: the renderer's hook into the attachment support. The
 * renderer only collects attachment work while it applies edits (see
 * DomRenderer.queueAttachment) and hands it over at the batch end; what
 * attaching and cleaning up means lives in `components/attachment.ts`,
 * which installs itself on the first `addAttachment` call. Apps that never
 * use `@attach` never import that module, so a bundler drops it.
 */
export interface AttachmentHost {
  /**
   * Runs one batch's attachment work: flat `(state, element, name, value)`
   * entries in application order; `element === null` asks to clean up the
   * attachments of the state's elements that left the DOM.
   */
  run(work: readonly unknown[], fail: (error: unknown, state: ComponentState) => void): void;
  /** Cleans up every attachment of a component that is being disposed. */
  dispose(state: ComponentState, fail: (error: unknown, state: ComponentState) => void): void;
}

/** The installed host; null until the first `addAttachment`. */
export let attachmentHost: AttachmentHost | null = null;

/** @internal Installs the attachment support (idempotent). */
export function installAttachmentHost(host: AttachmentHost): void {
  attachmentHost = host;
}
