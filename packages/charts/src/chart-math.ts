/**
 * The math of @tsazor/charts (docs/design-charts.md): a value axis with round ticks, lines and smooth curves, the
 * stacks of stacked bars, the arcs of a pie or a donut, and the words a screen reader reads for a chart. Pure, so
 * the components only draw.
 */
import type { LibraryTexts } from "@tsazor/ui";
import { englishLibraryTexts } from "@tsazor/ui/kit";

/** A value axis: from `min` to `max` in steps of `step`, the ticks included. */
export interface ValueAxis {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly ticks: readonly number[];
}

/** The round step nearest above `rough`: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(rough: number): number {
  if (!(rough > 0) || !Number.isFinite(rough)) return 1;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * power;
}

/**
 * The value axis for values from `low` to `high`: it takes in zero (bars and areas stand on it), and has at most
 * `maxTicks` ticks, or ticks every `step` when one is given (MudBlazor's `YAxisTicks`).
 */
export function valueAxis(low: number, high: number, options: { maxTicks?: number; step?: number; min?: number; max?: number } = {}): ValueAxis {
  let from = Math.min(0, low, options.min ?? 0);
  let to = Math.max(0, high, options.max ?? 0);
  if (options.min !== undefined) from = options.min;
  if (options.max !== undefined) to = Math.max(options.max, from);
  if (from === to) to = from + 1;
  const maxTicks = Math.max(2, options.maxTicks ?? 6);
  const step = options.step !== undefined && options.step > 0 ? options.step : niceStep((to - from) / (maxTicks - 1));
  const min = Math.floor(from / step + 1e-9) * step;
  const max = Math.ceil(to / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let value = min; value <= max + step / 2; value += step) ticks.push(Number(value.toPrecision(12)));
  return { min, max: ticks[ticks.length - 1]!, step, ticks };
}

/** A linear map from a domain onto a range. */
export function linearScale(domain: readonly [number, number], range: readonly [number, number]): (value: number) => number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (value) => r0 + ((value - d0) / span) * (r1 - r0);
}

/** A point of a line. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

const r = (value: number): number => Math.round(value * 100) / 100;

/**
 * The SVG path of a line through the points: straight, or a smooth curve that doesn't overshoot (monotone cubic,
 * Fritsch–Carlson), so a smoothed line never shows a value the data doesn't have.
 */
export function linePath(points: readonly Point[], smooth = false): string {
  if (points.length === 0) return "";
  if (points.length === 1 || !smooth) return points.map((point, i) => `${i === 0 ? "M" : "L"}${r(point.x)},${r(point.y)}`).join(" ");
  const n = points.length;
  const dx = points.slice(1).map((point, i) => point.x - points[i]!.x);
  const slope = points.slice(1).map((point, i) => (point.y - points[i]!.y) / (dx[i] || 1));
  const tangent = points.map((_, i) => {
    if (i === 0) return slope[0]!;
    if (i === n - 1) return slope[n - 2]!;
    const [a, b] = [slope[i - 1]!, slope[i]!];
    return a * b <= 0 ? 0 : (3 * (dx[i - 1]! + dx[i]!)) / ((2 * dx[i]! + dx[i - 1]!) / a + (dx[i]! + 2 * dx[i - 1]!) / b);
  });
  let path = `M${r(points[0]!.x)},${r(points[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const [p, q] = [points[i]!, points[i + 1]!];
    const third = dx[i]! / 3;
    path += ` C${r(p.x + third)},${r(p.y + tangent[i]! * third)} ${r(q.x - third)},${r(q.y - tangent[i + 1]! * third)} ${r(q.x)},${r(q.y)}`;
  }
  return path;
}

/** The SVG path of the area under a line, down to `baseline` (its y). */
export function areaPath(points: readonly Point[], baseline: number, smooth = false): string {
  if (points.length === 0) return "";
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${linePath(points, smooth)} L${r(last.x)},${r(baseline)} L${r(first.x)},${r(baseline)} Z`;
}

/** The stacks of stacked bars: for each series, where each of its bars starts and ends (negatives stack down). */
export function stackSeries(series: readonly (readonly number[])[]): { from: number; to: number }[][] {
  const length = Math.max(0, ...series.map((data) => data.length));
  const up = new Array<number>(length).fill(0);
  const down = new Array<number>(length).fill(0);
  return series.map((data) =>
    Array.from({ length }, (_, i) => {
      const value = data[i] ?? 0;
      const base = value >= 0 ? up : down;
      const from = base[i]!;
      base[i] = from + value;
      return { from, to: from + value };
    }),
  );
}

/** The slices of a pie or a donut: each value's share of the circle, from 12 o'clock clockwise (radians). */
export function pieSlices(values: readonly number[]): { start: number; end: number; share: number }[] {
  const total = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  let angle = 0;
  return values.map((value) => {
    const share = total === 0 ? 0 : Math.max(0, value) / total;
    const start = angle;
    angle += share * 2 * Math.PI;
    return { start, end: angle, share };
  });
}

/** The SVG path of a slice from `start` to `end` (radians from 12 o'clock): a pie's to the center, a donut's ring. */
export function arcPath(cx: number, cy: number, radius: number, inner: number, start: number, end: number): string {
  // A full circle is two halves (an arc can't start where it ends).
  if (end - start >= 2 * Math.PI - 1e-9) {
    const half = start + Math.PI;
    return `${arcPath(cx, cy, radius, inner, start, half)} ${arcPath(cx, cy, radius, inner, half, start + 2 * Math.PI)}`;
  }
  const at = (rad: number, angle: number): string => `${r(cx + rad * Math.sin(angle))},${r(cy - rad * Math.cos(angle))}`;
  const large = end - start > Math.PI ? 1 : 0;
  if (inner <= 0) return `M${r(cx)},${r(cy)} L${at(radius, start)} A${r(radius)},${r(radius)} 0 ${large} 1 ${at(radius, end)} Z`;
  return `M${at(radius, start)} A${r(radius)},${r(radius)} 0 ${large} 1 ${at(radius, end)} L${at(inner, end)} A${r(inner)},${r(inner)} 0 ${large} 0 ${at(inner, start)} Z`;
}

/** The chart in words for its text alternative: per series, where it goes (axis charts) or each share (a pie). */
export function chartSummary(
  type: "line" | "area" | "bar" | "stacked-bar" | "donut" | "pie",
  series: readonly { name: string; data: readonly number[] }[],
  labels: readonly string[],
  format: (value: number) => string,
  t: LibraryTexts = englishLibraryTexts,
): string {
  const kinds = { line: "chart.line", area: "chart.area", bar: "chart.bar", "stacked-bar": "chart.stackedBar", donut: "chart.donut", pie: "chart.pie" } as const;
  const kind = t(kinds[type]);
  if (type === "donut" || type === "pie") {
    const values = series[0]?.data ?? [];
    const slices = pieSlices(values);
    const parts = values.map((value, i) => t("chart.slice", { label: labels[i] ?? `${i + 1}`, value: format(value), share: Math.round(slices[i]!.share * 100) }));
    const chart = series[0]?.name ? t("chart.of", { chart: kind, series: series[0].name }) : kind;
    return t("chart.summary", { chart, parts: parts.join(", ") });
  }
  const parts = series.map((s) => {
    if (s.data.length === 0) return t("chart.noValues", { series: s.name });
    const low = Math.min(...s.data);
    const high = Math.max(...s.data);
    return low === high ? t("chart.at", { series: s.name, value: format(low) }) : t("chart.range", { series: s.name, low: format(low), high: format(high) });
  });
  return labels.length > 1
    ? t("chart.summaryOver", { chart: kind, parts: parts.join("; "), first: labels[0], last: labels[labels.length - 1] })
    : t("chart.summary", { chart: kind, parts: parts.join("; ") });
}
