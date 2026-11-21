import type { ComponentState } from "./component-state.js";

/**
 * F4/F5 `@transition`, `@in`, `@out`, `@animate`: the renderer's hook into
 * the motion support, built like the attachment hook (attachment-host.ts).
 * While the applier works it only asks whether a removed child must stay for
 * an outro, measures animated children before they move, and queues work;
 * `components/motion.ts` runs that work at the batch end. It installs itself
 * on the first `addTransition`/`addAnimate`, so apps without motion
 * directives never bundle it.
 */
export interface MotionHost {
  /** F5: whether any live element has an `@animate` (levels are only measured then). */
  readonly animates: boolean;
  /**
   * Whether the logical child starting at `first`, removed by a pass of
   * `state`, holds an element whose outro plays now (it then stays in the
   * DOM as a leaving child).
   */
  leaves(state: ComponentState, first: Node): boolean;
  /** F5: queues `node`'s position before the pass moves it, if it is an animated element. */
  measure(node: Node, work: MotionWork[]): void;
  /** Runs one batch's motion work (in application order). */
  run(work: readonly MotionWork[], context: MotionContext): void;
}

/** One unit of queued motion work. */
export type MotionWork =
  /** A motion frame was set on an element: `inserted` with the element, else updated. */
  | { readonly op: "set"; readonly state: ComponentState; readonly element: Element; readonly name: string; readonly value: unknown; readonly inserted: boolean; readonly firstPass: boolean }
  /** A motion frame was removed from a live element. */
  | { readonly op: "remove"; readonly state: ComponentState; readonly element: Element; readonly name: string }
  /** The logical child starting at `first` was removed but stays for its outros. */
  | { readonly op: "leave"; readonly state: ComponentState; readonly first: Node }
  /** Elements may have left the DOM: forget their motion state. */
  | { readonly op: "sweep" }
  /** F5: an animated element's box before the pass. */
  | { readonly op: "measure"; readonly element: Element; readonly rect: DOMRect };

/** What the renderer passes to a batch's motion work. */
export interface MotionContext {
  /** The app's first batch: no intros play (Svelte's `intro: false`). */
  readonly initial: boolean;
  /** Routes a failure of a transition function to its component. */
  readonly fail: (error: unknown, state: ComponentState) => void;
  /** A leaving child left the DOM: its components' attachments are cleaned up. */
  readonly removed: (states: readonly ComponentState[]) => void;
}

/** The installed host; null until the first motion frame. */
export let motionHost: MotionHost | null = null;

/** @internal Installs the motion support (idempotent). */
export function installMotionHost(host: MotionHost): void {
  motionHost = host;
}
