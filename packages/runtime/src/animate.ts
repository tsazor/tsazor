/**
 * The built-in animation for `@animate` (`@tsazor/runtime/animate`, Svelte's
 * `svelte/animate`): `flip` slides the items of a keyed loop to their new
 * places when the list changes order.
 *
 * ```razor
 * @foreach (var todo in todos) {
 *     <li @key="todo.id" @animate="flip">@todo.text</li>
 * }
 * ```
 *
 * @module
 */
import type { Animate, TransitionConfig } from "./components/motion.js";
import { cubicOut } from "./easing.js";

export type { Animate, TransitionConfig } from "./components/motion.js";

/** Parameters of `flip`. */
export interface FlipParams {
  /** Milliseconds before it starts. Default 0. */
  delay?: number;
  /** Milliseconds, or a function of the distance in pixels. Default `√distance × 120`. */
  duration?: number | ((distance: number) => number);
  /** The easing function. Default `cubicOut`. */
  easing?: (t: number) => number;
}

/** `flip`: an `Animate` itself, and — called with parameters — a factory for one. */
export interface Flip {
  /** Used bare: FLIP with the default parameters. */
  (element: Element, rects: { readonly from: DOMRect; readonly to: DOMRect }): TransitionConfig;
  /** Called with parameters: FLIP with those. */
  (params?: FlipParams): Animate;
}

/**
 * FLIP (First, Last, Invert, Play): the element jumps to its new place, then
 * a transform takes it from where it was to there.
 */
export const flip: Flip = function (first?: Element | FlipParams, rects?: { readonly from: DOMRect; readonly to: DOMRect }): TransitionConfig | Animate {
  if (rects !== undefined) return flipConfig(first as Element, rects, {});
  const params = (first ?? {}) as FlipParams;
  return (element, moved) => flipConfig(element, moved, params);
} as Flip;

function flipConfig(element: Element, { from, to }: { readonly from: DOMRect; readonly to: DOMRect }, params: FlipParams): TransitionConfig {
  const { delay = 0, duration = (d: number) => Math.sqrt(d) * 120, easing = cubicOut } = params;
  const style = getComputedStyle(element);
  const transform = style.transform === "none" ? "" : style.transform;
  const [ox = 0, oy = 0] = style.transformOrigin.split(" ").map(parseFloat);
  const width = element.clientWidth || to.width;
  const height = element.clientHeight || to.height;
  const sx = width / to.width || 1;
  const sy = height / to.height || 1;
  const fx = from.left + from.width * (ox / width || 0);
  const fy = from.top + from.height * (oy / height || 0);
  const tx = to.left + to.width * (ox / width || 0);
  const ty = to.top + to.height * (oy / height || 0);
  const dx = (fx - tx) * sx;
  const dy = (fy - ty) * sy;
  const dsx = from.width / to.width || 1;
  const dsy = from.height / to.height || 1;
  return {
    delay,
    duration: typeof duration === "function" ? duration(Math.sqrt(dx * dx + dy * dy)) : duration,
    easing,
    css: (t, u) => `transform: ${transform} translate(${u * dx}px, ${u * dy}px) scale(${t + u * dsx}, ${t + u * dsy})`,
  };
}
