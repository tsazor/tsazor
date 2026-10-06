/**
 * The built-in transitions for `@transition`, `@in` and `@out`
 * (`@tsazor/runtime/transition`, Svelte's `svelte/transition` set). Each one
 * works bare (`@transition="fade"`) or with parameters
 * (`@in="fly({ y: 200, duration: 600 })"`).
 *
 * ```razor
 * @if (visible) {
 *     <p @transition="fade">Fades in and out</p>
 * }
 * ```
 *
 * @module
 */
import type { Transition, TransitionConfig, TransitionOptions } from "./components/motion.js";
import { cubicInOut, cubicOut, linear } from "./easing.js";

export type { Transition, TransitionConfig, TransitionOptions } from "./components/motion.js";

/**
 * A built-in transition: a `Transition` itself, and — called with
 * parameters — a factory for one.
 */
export interface BuiltInTransition<P, E extends Element = Element> {
  /** Used bare: the transition with its default parameters. */
  (element: E, options?: TransitionOptions): TransitionConfig;
  /** Called with parameters: the transition with those. */
  (params?: P): Transition<E>;
}

/** The timing every built-in transition takes. */
export interface TransitionTiming {
  /** Milliseconds before it starts. Default 0. */
  delay?: number;
  /** Milliseconds it takes. Default 400. */
  duration?: number;
  /** The easing function (see `@tsazor/runtime/easing`). */
  easing?: (t: number) => number;
}

/** Parameters of `fade`. Default easing: `linear`. */
export type FadeParams = TransitionTiming;

/** Parameters of `blur`. Default easing: `cubicInOut`. */
export interface BlurParams extends TransitionTiming {
  /** The blur radius at the start, a number (px) or a CSS length. Default 5. */
  amount?: number | string;
  /** The opacity at the start. Default 0. */
  opacity?: number;
}

/** Parameters of `fly`. Default easing: `cubicOut`. */
export interface FlyParams extends TransitionTiming {
  /** Horizontal offset at the start, a number (px) or a CSS length. Default 0. */
  x?: number | string;
  /** Vertical offset at the start, a number (px) or a CSS length. Default 0. */
  y?: number | string;
  /** The opacity at the start. Default 0. */
  opacity?: number;
}

/** Parameters of `slide`. Default easing: `cubicOut`. */
export interface SlideParams extends TransitionTiming {
  /** `"y"` (default) slides the height, `"x"` the width. */
  axis?: "x" | "y";
}

/** Parameters of `scale`. Default easing: `cubicOut`. */
export interface ScaleParams extends TransitionTiming {
  /** The scale at the start. Default 0. */
  start?: number;
  /** The opacity at the start. Default 0. */
  opacity?: number;
}

/** Parameters of `draw`. Default easing: `cubicInOut`. */
export interface DrawParams {
  /** Milliseconds before it starts. Default 0. */
  delay?: number;
  /** Pixels per millisecond, instead of a duration (longer paths take longer). */
  speed?: number;
  /** Milliseconds, or a function of the path length. Default 800 (without `speed`). */
  duration?: number | ((length: number) => number);
  /** The easing function. */
  easing?: (t: number) => number;
}

/** Fades the element's opacity in or out. */
export const fade: BuiltInTransition<FadeParams> = builtIn<FadeParams, Element>((element, { delay = 0, duration = 400, easing = linear }) => {
  const opacity = opacityOf(getComputedStyle(element));
  return { delay, duration, easing, css: (t) => `opacity: ${t * opacity}` };
});

/** Blurs and fades the element. */
export const blur: BuiltInTransition<BlurParams> = builtIn<BlurParams, Element>((element, { delay = 0, duration = 400, easing = cubicInOut, amount = 5, opacity = 0 }) => {
  const style = getComputedStyle(element);
  const targetOpacity = opacityOf(style);
  const filter = style.filter === "none" ? "" : style.filter;
  const od = targetOpacity * (1 - opacity);
  const [value, unit] = splitCssUnit(amount);
  return { delay, duration, easing, css: (_t, u) => `opacity: ${targetOpacity - od * u}; filter: ${filter} blur(${u * value}${unit})` };
});

/** Moves the element in from (or out to) an offset while fading it. */
export const fly: BuiltInTransition<FlyParams> = builtIn<FlyParams, Element>((element, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) => {
  const style = getComputedStyle(element);
  const targetOpacity = opacityOf(style);
  const transform = style.transform === "none" ? "" : style.transform;
  const od = targetOpacity * (1 - opacity);
  const [xValue, xUnit] = splitCssUnit(x);
  const [yValue, yUnit] = splitCssUnit(y);
  return {
    delay,
    duration,
    easing,
    css: (t, u) => `transform: ${transform} translate(${(1 - t) * xValue}${xUnit}, ${(1 - t) * yValue}${yUnit}); opacity: ${targetOpacity - od * u}`,
  };
});

/** Slides the element open or shut (its height, or its width with `axis: "x"`). */
export const slide: BuiltInTransition<SlideParams> = builtIn<SlideParams, Element>((element, { delay = 0, duration = 400, easing = cubicOut, axis = "y" }) => {
  const style = getComputedStyle(element);
  const opacity = opacityOf(style);
  const primary = axis === "y" ? "height" : "width";
  const size = parseFloat(style[primary]);
  const [start, end] = axis === "y" ? (["top", "bottom"] as const) : (["left", "right"] as const);
  const px = (property: string): number => parseFloat(style.getPropertyValue(property)) || 0;
  const paddingStart = px(`padding-${start}`);
  const paddingEnd = px(`padding-${end}`);
  const marginStart = px(`margin-${start}`);
  const marginEnd = px(`margin-${end}`);
  const borderStart = px(`border-${start}-width`);
  const borderEnd = px(`border-${end}-width`);
  return {
    delay,
    duration,
    easing,
    css: (t) =>
      "overflow: hidden;" +
      `opacity: ${Math.min(t * 20, 1) * opacity};` +
      `${primary}: ${t * size}px;` +
      `padding-${start}: ${t * paddingStart}px;` +
      `padding-${end}: ${t * paddingEnd}px;` +
      `margin-${start}: ${t * marginStart}px;` +
      `margin-${end}: ${t * marginEnd}px;` +
      `border-${start}-width: ${t * borderStart}px;` +
      `border-${end}-width: ${t * borderEnd}px;` +
      `min-${primary}: 0`,
  };
});

/** Scales the element up from (or down to) `start` while fading it. */
export const scale: BuiltInTransition<ScaleParams> = builtIn<ScaleParams, Element>((element, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 }) => {
  const style = getComputedStyle(element);
  const targetOpacity = opacityOf(style);
  const transform = style.transform === "none" ? "" : style.transform;
  const sd = 1 - start;
  const od = targetOpacity * (1 - opacity);
  return { delay, duration, easing, css: (_t, u) => `transform: ${transform} scale(${1 - sd * u}); opacity: ${targetOpacity - od * u}` };
});

/** Draws an SVG shape's stroke (`<path>`, `<polyline>`, …) in or out. */
export const draw: BuiltInTransition<DrawParams, SVGGeometryElement> = builtIn<DrawParams, SVGGeometryElement>((element, { delay = 0, speed, duration, easing = cubicInOut }) => {
  let length = element.getTotalLength();
  const style = getComputedStyle(element);
  if (style.strokeLinecap !== "butt") length += parseInt(style.strokeWidth, 10) || 0;
  const time = duration === undefined ? (speed === undefined ? 800 : length / speed) : typeof duration === "function" ? duration(length) : duration;
  return { delay, duration: time, easing, css: (_t, u) => `stroke-dasharray: ${length}; stroke-dashoffset: ${u * length}` };
});

/** Parameters of `crossfade` and of its `send`/`receive` transitions. */
export interface CrossfadeParams {
  /** Milliseconds before it starts. Default 0. */
  delay?: number;
  /** Milliseconds, or a function of the distance in pixels. Default `√distance × 30`. */
  duration?: number | ((distance: number) => number);
  /** The easing function. Default `cubicOut`. */
  easing?: (t: number) => number;
}

/** The parameters of one `send`/`receive` use: `key` pairs a leaving element with an entering one. */
export interface CrossfadeKey extends CrossfadeParams {
  /** Identifies the item: the element sent with this key flies to the one received with it. */
  key: unknown;
}

/**
 * Creates a `send`/`receive` pair: an element leaving with `@out="send({ key })"`
 * flies to the place of the element entering with `@in="receive({ key })"` and
 * the same key, in the same render — an item moving between two lists.
 * Without a partner, `fallback` plays instead (nothing when there is none).
 *
 * ```razor
 * @code {
 *   [send, receive] = crossfade({ fallback: scale });
 * }
 * ```
 */
export function crossfade(options: CrossfadeParams & { fallback?: Transition } = {}): [send: (params: CrossfadeKey) => Transition, receive: (params: CrossfadeKey) => Transition] {
  const { fallback, ...defaults } = options;
  const toReceive = new Map<unknown, Element>();
  const toSend = new Map<unknown, Element>();

  function morph(from: Element, element: Element, params: CrossfadeParams): TransitionConfig {
    const { delay = 0, duration = (d: number) => Math.sqrt(d) * 30, easing = cubicOut } = { ...defaults, ...params };
    const a = from.getBoundingClientRect();
    const b = element.getBoundingClientRect();
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    const dw = a.width / b.width;
    const dh = a.height / b.height;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const style = getComputedStyle(element);
    const transform = style.transform === "none" ? "" : style.transform;
    const opacity = opacityOf(style);
    return {
      delay,
      duration: typeof duration === "function" ? duration(distance) : duration,
      easing,
      css: (t, u) =>
        `opacity: ${t * opacity}; transform-origin: top left; transform: ${transform} translate(${u * dx}px, ${u * dy}px) scale(${t + (1 - t) * dw}, ${t + (1 - t) * dh})`,
    };
  }

  function side(items: Map<unknown, Element>, counterparts: Map<unknown, Element>) {
    return (params: CrossfadeKey): Transition =>
      (element, transitionOptions) => {
        items.set(params.key, element);
        // Deferred: by now the partner (if any) has registered itself.
        return () => {
          const other = counterparts.get(params.key);
          if (other !== undefined) {
            counterparts.delete(params.key);
            return morph(other, element, params);
          }
          items.delete(params.key);
          if (fallback === undefined) return {};
          const config = fallback(element, transitionOptions);
          return typeof config === "function" ? config() : config;
        };
      };
  }

  return [side(toSend, toReceive), side(toReceive, toSend)];
}

/** Wraps a transition maker into the bare-or-with-parameters form. */
function builtIn<P, E extends Element>(make: (element: E, params: P) => TransitionConfig): BuiltInTransition<P, E> {
  return function (first?: E | P): TransitionConfig | Transition<E> {
    if (isElement(first)) return make(first as E, {} as P);
    const params = (first ?? {}) as P;
    return (element: E) => make(element, params);
  } as BuiltInTransition<P, E>;
}

function isElement(value: unknown): boolean {
  return typeof value === "object" && value !== null && (value as Node).nodeType === 1;
}

/** The computed opacity; 1 where the DOM computes none. */
function opacityOf(style: CSSStyleDeclaration): number {
  const opacity = parseFloat(style.opacity);
  return Number.isNaN(opacity) ? 1 : opacity;
}

/** `"2rem"` → `[2, "rem"]`, `5` → `[5, "px"]` (Svelte's split_css_unit). */
function splitCssUnit(value: number | string): [number, string] {
  const split = typeof value === "string" ? /^\s*(-?[\d.]+)([^\s]*)\s*$/.exec(value) : null;
  return split ? [parseFloat(split[1]!), split[2] || "px"] : [value as number, "px"];
}
