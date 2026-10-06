import { FrameType } from "../render-tree/frame-type.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { ComponentState } from "../renderer/component-state.js";
import { logicalChildContains, removeLogicalChild, unmarkLeaving } from "../renderer/logical-range.js";
import { installMotionHost, type MotionContext, type MotionHost, type MotionWork } from "../renderer/motion-host.js";

/**
 * What a transition or animation function returns (Svelte's contract): the
 * timing, and either `css` — a style for each `t`, played with the Web
 * Animations API, off the main thread — or `tick`, called every frame.
 * `t` runs from 0 to 1 for an intro and from 1 to 0 for an outro (eased);
 * `u` is `1 - t`.
 */
export interface TransitionConfig {
  /** Milliseconds before the transition starts. Default 0. */
  readonly delay?: number;
  /** Milliseconds the transition takes. Default 300. */
  readonly duration?: number;
  /** Maps linear progress (0..1) to `t`. Default linear. */
  readonly easing?: (t: number) => number;
  /** The element's style at `t`, as CSS declarations (`"opacity: 0.5; transform: …"`). */
  readonly css?: (t: number, u: number) => string;
  /** Called every animation frame with the current `t`. */
  readonly tick?: (t: number, u: number) => void;
}

/** What a transition function learns about its use. */
export interface TransitionOptions {
  /** `"in"` for `@in`, `"out"` for `@out`, `"both"` for `@transition`. */
  readonly direction: "in" | "out" | "both";
}

/**
 * A transition for `@transition`, `@in` and `@out` (F4, Svelte's
 * transitions): called with the element when it enters or leaves the DOM.
 * It returns the config, or a function returning it — that function is
 * called once all transitions of the batch were asked, which `crossfade`
 * uses to pair a leaving element with an entering one.
 *
 * ```razor
 * <p @transition="fade">…</p>
 * <p @in="fly({ y: 200 })" @out="fade">…</p>
 *
 * @code {
 *   spin: Transition = (element) => ({ duration: 600, css: (t) => `transform: rotate(${t * 360}deg)` });
 * }
 * ```
 */
export type Transition<E extends Element = Element> = (element: E, options: TransitionOptions) => TransitionConfig | (() => TransitionConfig);

/**
 * An animation for `@animate` (F5, Svelte's animations): called when an
 * element of a keyed loop moved, with its box before (`from`) and after
 * (`to`) the render. `flip` from `@tsazor/runtime/animate` is the built-in.
 */
export type Animate<E extends Element = Element> = (element: E, rects: { readonly from: DOMRect; readonly to: DOMRect }) => TransitionConfig;

/** Settings of the transition support. */
export interface TransitionSettings {
  /**
   * `"respect"` (default): users who ask for reduced motion
   * (`prefers-reduced-motion: reduce`) get every transition and animation
   * with duration 0 — the end state at once, events still fire. `"ignore"`
   * plays them anyway (for motion that carries meaning).
   */
  readonly reducedMotion?: "respect" | "ignore";
}

let respectReducedMotion = true;

/** Changes the transition settings for the whole app. */
export function configureTransitions(settings: TransitionSettings): void {
  if (settings.reducedMotion !== undefined) respectReducedMotion = settings.reducedMotion === "respect";
}

/**
 * Adds the frame of a motion directive (F4/F5) to the open element — what
 * the compiler emits for `@transition`, `@in`, `@out` (`name` the directive,
 * `":global"` appended for the `global` modifier). `null`, `undefined` and
 * `false` mean no transition.
 */
export function addTransition<E extends Element = Element>(
  builder: RenderTreeBuilder,
  sequence: number,
  name: "@transition" | "@in" | "@out" | "@transition:global" | "@in:global" | "@out:global",
  value: Transition<E> | null | undefined | false,
): void {
  installMotionHost(host);
  builder.getFrames().push({ frameType: FrameType.Attachment, sequence, attributeName: name, attributeValue: value });
}

/** Adds the frame of an `@animate` (F5) to the open element — what the compiler emits for `@animate="…"`. */
export function addAnimate<E extends Element = Element>(
  builder: RenderTreeBuilder,
  sequence: number,
  value: Animate<E> | null | undefined | false,
): void {
  installMotionHost(host);
  builder.getFrames().push({ frameType: FrameType.Attachment, sequence, attributeName: "@animate", attributeValue: value });
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

interface Directive {
  readonly value: unknown;
  readonly global: boolean;
}

/** An element with motion directives. */
interface Entry {
  readonly owner: ComponentState;
  in: Directive | null;
  out: Directive | null;
  /** `@transition`: in and out, reversible. */
  both: Directive | null;
  animate: unknown;
  /** The running intro or outro. */
  run: Run | null;
  runDirection: "in" | "out";
  /** The running FLIP animation. */
  flip: Run | null;
  /** Inside a leaving child: removed with it. */
  leaving: boolean;
}

const registry = new Map<Element, Entry>();
let animateCount = 0;

function entryFor(state: ComponentState, element: Element): Entry {
  let entry = registry.get(element);
  if (entry === undefined) {
    entry = { owner: state, in: null, out: null, both: null, animate: null, run: null, runDirection: "in", flip: null, leaving: false };
    registry.set(element, entry);
  }
  return entry;
}

function setDirective(entry: Entry, name: string, value: unknown): void {
  const colon = name.indexOf(":");
  const base = colon < 0 ? name : name.slice(0, colon);
  const directive = isPresent(value) ? { value, global: colon >= 0 } : null;
  switch (base) {
    case "@in":
      entry.in = directive;
      break;
    case "@out":
      entry.out = directive;
      break;
    case "@transition":
      entry.both = directive;
      break;
    case "@animate":
      if ((entry.animate !== null) !== (directive !== null)) animateCount += directive !== null ? 1 : -1;
      entry.animate = directive?.value ?? null;
      break;
  }
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

function forget(element: Element, entry: Entry): void {
  entry.run?.cancel();
  entry.flip?.cancel();
  if (entry.animate !== null) animateCount--;
  registry.delete(element);
}

/** The outro of an entry, if it plays when a pass of `state` removes it. */
function outroOf(entry: Entry, state: ComponentState): Directive | null {
  const directive = entry.out ?? entry.both;
  if (directive === null || entry.leaving) return null;
  // Local: only the owner's own renders; global: also when an ancestor removes the owner.
  return entry.owner === state || directive.global ? directive : null;
}

/* ------------------------------------------------------------------ */
/* Host                                                                */
/* ------------------------------------------------------------------ */

const host: MotionHost = {
  get animates() {
    return animateCount > 0;
  },
  leaves(state, first) {
    if (registry.size === 0 || first.nodeType === TEXT_NODE) return false;
    for (const [element, entry] of registry) {
      if (outroOf(entry, state) !== null && logicalChildContains(first, element)) return true;
    }
    return false;
  },
  measure(node, work) {
    if (node.nodeType !== ELEMENT_NODE) return;
    const element = node as Element;
    if (registry.get(element)?.animate) work.push({ op: "measure", element, rect: element.getBoundingClientRect() });
  },
  run(work, context) {
    /** Inserted elements with motion frames (one element has several), and whether it was the owner's first render. */
    const inserted = new Map<Element, boolean>();
    const leaves: Array<{ state: ComponentState; first: Node }> = [];
    const measured: Array<{ element: Element; rect: DOMRect }> = [];
    let sweep = false;
    for (const item of work) {
      switch (item.op) {
        case "set":
          if (item.state.disposed) break;
          setDirective(entryFor(item.state, item.element), item.name, item.value);
          if (item.inserted) inserted.set(item.element, item.firstPass);
          break;
        case "remove": {
          const entry = registry.get(item.element);
          if (entry !== undefined) setDirective(entry, item.name, null);
          break;
        }
        case "leave":
          leaves.push(item);
          break;
        case "measure":
          measured.push(item);
          break;
        case "sweep":
          sweep = true;
          break;
      }
    }
    // The outros of each leaving child, found before the sweep: a removed
    // child component's elements (global outros) stay with the child.
    const leaving = leaves.map(({ state, first }) => {
      const outros: Array<{ element: Element; entry: Entry; directive: Directive }> = [];
      const inside: Array<[Element, Entry]> = [];
      for (const [element, entry] of registry) {
        if (!logicalChildContains(first, element)) continue;
        const directive = outroOf(entry, state);
        if (directive !== null) outros.push({ element, entry, directive });
        inside.push([element, entry]);
      }
      for (const [, entry] of inside) entry.leaving = true;
      return { state, first, outros, inside };
    });
    if (sweep) sweepRegistry();

    // Outros: every leaving child waits for the outros that play in it.
    const starts: Array<() => void> = [];
    const pending: Array<{ element: Element; entry: Entry; config: TransitionConfig | (() => TransitionConfig); start: (config: TransitionConfig) => void }> = [];
    for (const { state, first, outros, inside } of leaving) {
      let remaining = outros.length;
      const done = (): void => {
        if (--remaining > 0) return;
        // The last outro ended: the child leaves the DOM with everything in it.
        unmarkLeaving(first);
        removeLogicalChild(first, null);
        const owners = new Set<ComponentState>();
        for (const [element, entry] of inside) {
          owners.add(entry.owner);
          if (registry.get(element) === entry) forget(element, entry);
        }
        owners.add(state);
        context.removed([...owners]);
      };
      if (remaining === 0) {
        remaining = 1;
        done();
        continue;
      }
      for (const { element, entry, directive } of outros) {
        // `@transition` reverses a running intro from where it is; a separate `@in` is cancelled.
        let from = 1;
        if (entry.run !== null) {
          if (entry.both !== null && entry.runDirection === "in") from = entry.run.t;
          entry.run.cancel();
          entry.run = null;
        }
        const config = ask(directive, element, entry.both !== null && directive === entry.both ? "both" : "out", entry.owner, context);
        if (config === null) {
          starts.push(done);
          continue;
        }
        pending.push({
          element,
          entry,
          config,
          start: (resolved) => {
            dispatch(element, "outrostart");
            entry.runDirection = "out";
            entry.run = new Run(element, resolved, from, 0, true, () => {
              entry.run = null;
              dispatch(element, "outroend");
              done();
            });
          },
        });
      }
    }

    // FLIP (F5): fix leaving animated elements in place, then animate the moved ones.
    if (measured.length > 0) {
      for (const { first } of leaves) {
        const entry = first.nodeType === ELEMENT_NODE ? registry.get(first as Element) : undefined;
        if (entry?.animate) fixPosition(first as HTMLElement);
      }
      for (const { element, rect: from } of measured) {
        const entry = registry.get(element);
        if (entry === undefined || entry.leaving || !entry.animate || !element.isConnected) continue;
        entry.flip?.cancel();
        entry.flip = null;
        const to = element.getBoundingClientRect();
        if (from.left === to.left && from.top === to.top && from.width === to.width && from.height === to.height) continue;
        let config: TransitionConfig;
        try {
          config = (entry.animate as Animate)(element, { from, to });
        } catch (error) {
          context.fail(error, entry.owner);
          continue;
        }
        entry.flip = new Run(element, config, 0, 1, false, () => {
          entry.flip = null;
        });
      }
    }

    // Intros.
    for (const [element, firstPass] of context.initial ? [] : inserted) {
      const entry = registry.get(element);
      if (entry === undefined) continue;
      const directive = entry.in ?? entry.both;
      // Local intros don't play on the component's first render; global ones do.
      if (directive === null || entry.leaving || (firstPass && !directive.global) || !element.isConnected) continue;
      const config = ask(directive, element, entry.in !== null ? "in" : "both", entry.owner, context);
      if (config === null) continue;
      pending.push({
        element,
        entry,
        config,
        start: (resolved) => {
          dispatch(element, "introstart");
          entry.runDirection = "in";
          entry.run = new Run(element, resolved, 0, 1, false, () => {
            entry.run = null;
            dispatch(element, "introend");
          });
        },
      });
    }

    // All transitions were asked: resolve the deferred configs (crossfade pairs) and start.
    for (const item of pending) {
      let config: TransitionConfig;
      try {
        config = typeof item.config === "function" ? item.config() : item.config;
      } catch (error) {
        context.fail(error, item.entry.owner);
        config = {};
      }
      item.start(config ?? {});
    }
    for (const start of starts) start();
  },
};


/** Asks a transition function for its config; null when it threw (reported). */
function ask(directive: Directive, element: Element, direction: TransitionOptions["direction"], owner: ComponentState, context: MotionContext): TransitionConfig | (() => TransitionConfig) | null {
  try {
    return (directive.value as Transition)(element, { direction }) ?? {};
  } catch (error) {
    context.fail(error, owner);
    return null;
  }
}

/** Forgets elements that left the DOM without an outro (or whose component is gone). */
function sweepRegistry(): void {
  for (const [element, entry] of registry) {
    if (entry.leaving) continue;
    const parent = entry.owner.disposed ? null : entry.owner.range.start.parentNode;
    if (parent === null || !parent.contains(element)) forget(element, entry);
  }
}

function dispatch(element: Element, type: string): void {
  element.dispatchEvent(new Event(type));
}

/**
 * Svelte's fix_position: a leaving element of an animated list is taken out
 * of the flow (absolute, same size and place), so its siblings move into
 * the gap while it plays its outro.
 */
function fixPosition(element: HTMLElement): void {
  const style = getComputedStyle(element);
  if (style.position === "absolute" || style.position === "fixed") return;
  const { width, height } = style;
  const before = element.getBoundingClientRect();
  element.style.position = "absolute";
  element.style.width = width;
  element.style.height = height;
  const after = element.getBoundingClientRect();
  if (before.left !== after.left || before.top !== after.top) {
    const transform = getComputedStyle(element).transform;
    element.style.transform = `${transform === "none" ? "" : transform} translate(${before.left - after.left}px, ${before.top - after.top}px)`;
  }
}

/* ------------------------------------------------------------------ */
/* Playing                                                             */
/* ------------------------------------------------------------------ */

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

function linear(t: number): number {
  return t;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function prefersReducedMotion(): boolean {
  if (!respectReducedMotion || typeof matchMedia !== "function") return false;
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const requestFrame: (callback: () => void) => unknown =
  typeof requestAnimationFrame === "function" ? (callback) => requestAnimationFrame(callback) : (callback) => setTimeout(callback, 16);
const cancelFrame: (handle: unknown) => void =
  typeof cancelAnimationFrame === "function" ? (handle) => cancelAnimationFrame(handle as number) : (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>);

/**
 * One running transition or animation from `t = from` to `t = to`. `css` is
 * sampled into keyframes and played with the Web Animations API (where the
 * DOM has it); `tick` runs on animation frames; a timer ends the run. With
 * `keep` the end style stays (an outro, until the element is removed).
 */
class Run {
  private animation: Animation | null = null;
  private frame: unknown = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly start = now();
  private readonly delay: number;
  private readonly duration: number;
  private readonly easing: (t: number) => number;
  private ended = false;

  constructor(
    element: Element,
    private readonly config: TransitionConfig,
    private readonly from: number,
    private readonly to: number,
    private readonly keep: boolean,
    private readonly onEnd: () => void,
  ) {
    const reduced = prefersReducedMotion();
    this.delay = reduced ? 0 : Math.max(0, config.delay ?? 0);
    this.duration = reduced ? 0 : Math.max(0, (config.duration ?? 300) * Math.abs(to - from));
    this.easing = config.easing ?? linear;
    if (this.duration === 0 && this.delay === 0) {
      // Nothing to play: the end state at once.
      this.finish();
      return;
    }
    if (config.css !== undefined) this.animate(element, this.duration);
    if (config.tick !== undefined) {
      config.tick(from, 1 - from);
      const loop = (): void => {
        if (this.ended) return;
        const t = this.t;
        config.tick!(t, 1 - t);
        this.frame = requestFrame(loop);
      };
      this.frame = requestFrame(loop);
    }
    this.timer = setTimeout(() => this.finish(), this.delay + this.duration);
  }

  /** The current `t`. */
  get t(): number {
    if (this.ended || this.duration === 0) return this.to;
    const progress = Math.min(1, Math.max(0, (now() - this.start - this.delay) / this.duration));
    return this.from + (this.to - this.from) * this.easing(progress);
  }

  /** Stops the run without its end callback (removes its style). */
  cancel(): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.animation?.cancel();
  }

  /** Svelte 5's keyframes: `css` sampled at 60 per second, eased; played linearly. */
  private animate(element: Element, duration: number): void {
    if (typeof (element as Element & { animate?: unknown }).animate !== "function") return;
    const css = this.config.css!;
    const steps = Math.max(1, Math.ceil(duration / (1000 / 60)));
    const keyframes: Keyframe[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = this.from + (this.to - this.from) * this.easing(i / steps);
      keyframes.push(toKeyframe(css(t, 1 - t)));
    }
    this.animation = element.animate(keyframes, { duration, delay: this.delay, easing: "linear", fill: "both" });
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.stop();
    this.config.tick?.(this.to, 1 - this.to);
    if (!this.keep) this.animation?.cancel();
    this.onEnd();
  }

  private stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    if (this.frame !== null) cancelFrame(this.frame);
    this.timer = null;
    this.frame = null;
  }
}

/** `"opacity: 0.5; transform-origin: top left"` → `{ opacity: "0.5", transformOrigin: "top left" }`. */
function toKeyframe(css: string): Keyframe {
  const keyframe: Keyframe = {};
  for (const declaration of css.split(";")) {
    const colon = declaration.indexOf(":");
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim();
    if (property === "") continue;
    const name = property.startsWith("--") ? property : property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    keyframe[name] = declaration.slice(colon + 1).trim();
  }
  return keyframe;
}
