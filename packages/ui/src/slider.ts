/**
 * The arithmetic of a slider (Fluent UI Blazor's FluentSlider, MudBlazor's MudSlider): where a value sits on the
 * track, and the values of its tick marks.
 */

/** Where `value` sits between `min` and `max`, from 0 to 1 (clamped; 0 when the range is empty). */
export function sliderFraction(value: number, min: number, max: number): number {
  if (!(max > min) || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** The decimals of a number as written (0.25 → 2, 1e-3 → 3). */
function decimals(value: number): number {
  const text = String(value);
  const exponent = /e-(\d+)$/.exec(text);
  if (exponent !== null) return Number(exponent[1]);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/**
 * The values of a slider's tick marks, one per step from `min` to `max` (MudBlazor's `TickMarks`): 0, 25, …, 100.
 * Rounded to the decimals of `min` and `step`, so 0.1 steps give 0.3, not 0.30000000000000004. Empty when the steps
 * are too many to draw (more than `limit`).
 */
export function sliderTicks(min: number, max: number, step: number, limit = 1000): number[] {
  if (!(max > min) || !(step > 0)) return [];
  const count = Math.floor((max - min) / step + 1e-9) + 1;
  if (count > limit) return [];
  const places = Math.max(decimals(min), decimals(step));
  return Array.from({ length: count }, (_, index) => Number((min + index * step).toFixed(places)));
}
