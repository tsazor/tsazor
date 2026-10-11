/**
 * Colors for the color picker (Fluent UI Blazor's FluentColorPicker, MudBlazor's MudColorPicker): hex text, "#0f6cbd",
 * as the value — what an `<input type="color">` and CSS take — and HSV for the saturation square and the hue bar.
 */

/** A color as "#rrggbb" (lower case). */
export type HexColor = string;

/** Red, green and blue, 0–255. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Hue 0–360, saturation and value 0–1. */
export interface Hsv {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** "#0F6CBD", "0f6cbd" or "#fc0" as "#rrggbb"; undefined for text that is no hex color. */
export function normalizeHexColor(text: string): HexColor | undefined {
  const match = HEX.exec(text.trim());
  if (match === null) return undefined;
  const digits = match[1]!.toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits}`;
}

/** The red, green and blue of a hex color, or undefined when it is none. */
export function hexToRgb(text: string): Rgb | undefined {
  const hex = normalizeHexColor(text);
  if (hex === undefined) return undefined;
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** "#rrggbb" of red, green and blue (rounded, within 0–255). */
export function rgbToHex({ r, g, b }: Rgb): HexColor {
  const two = (channel: number): string => Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, "0");
  return `#${two(r)}${two(g)}${two(b)}`;
}

/** HSV of RGB. A gray has hue 0. */
export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  let h = 0;
  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }
  return { h: (h + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

/** RGB of HSV. */
export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;
  const [r, g, b] =
    hue < 60 ? [chroma, x, 0] : hue < 120 ? [x, chroma, 0] : hue < 180 ? [0, chroma, x] : hue < 240 ? [0, x, chroma] : hue < 300 ? [x, 0, chroma] : [chroma, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** The hex color of HSV. */
export function hsvToHex(hsv: Hsv): HexColor {
  return rgbToHex(hsvToRgb(hsv));
}

/** HSV of a hex color, or undefined when it is none. */
export function hexToHsv(text: string): Hsv | undefined {
  const rgb = hexToRgb(text);
  return rgb === undefined ? undefined : rgbToHsv(rgb);
}

/** The palette color nearest to `color` (by RGB distance), or undefined for no color or an empty palette. */
export function closestColor(palette: readonly string[], color: string): HexColor | undefined {
  const target = hexToRgb(color);
  if (target === undefined) return undefined;
  let best: HexColor | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of palette) {
    const rgb = hexToRgb(candidate);
    if (rgb === undefined) continue;
    const distance = (rgb.r - target.r) ** 2 + (rgb.g - target.g) ** 2 + (rgb.b - target.b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = normalizeHexColor(candidate);
    }
  }
  return best;
}

/**
 * Where a key moves in a grid of `count` swatches, `columns` a row (the arrows by one and by a row, Home and End to
 * the row's ends, Ctrl+Home and Ctrl+End to the first and the last; left and right swapped right to left). Undefined
 * for any other key, or at an edge.
 */
export function swatchKeyTarget(key: { key: string; ctrlKey?: boolean }, index: number, count: number, columns: number, rtl = false): number | undefined {
  const rowStart = index - (index % columns);
  let next: number;
  switch (key.key) {
    case "ArrowRight": next = index + (rtl ? -1 : 1); break;
    case "ArrowLeft": next = index + (rtl ? 1 : -1); break;
    case "ArrowDown": next = index + columns; break;
    case "ArrowUp": next = index - columns; break;
    case "Home": next = key.ctrlKey ? 0 : rowStart; break;
    case "End": next = key.ctrlKey ? count - 1 : Math.min(count - 1, rowStart + columns - 1); break;
    default: return undefined;
  }
  return next < 0 || next >= count || next === index ? undefined : next;
}

/**
 * Where a key moves on the color wheel, whose rows of hexagons are `rowSizes` long and centered: left and right by
 * one in reading order (swapped right to left), up and down to the nearest hexagon of the row above or below, Home and
 * End to the first and the last. Undefined for any other key, or at an edge.
 */
export function wheelKeyTarget(key: { key: string }, index: number, rowSizes: readonly number[], rtl = false): number | undefined {
  const count = rowSizes.reduce((sum, size) => sum + size, 0);
  let row = 0;
  let start = 0;
  while (row < rowSizes.length - 1 && index >= start + rowSizes[row]!) start += rowSizes[row++]!;
  const across = (step: -1 | 1): number | undefined => {
    const target = row + step;
    if (target < 0 || target >= rowSizes.length) return undefined;
    // Rows are centered: the same x is `col - (size - 1) / 2` in both. Between two hexagons, the outer one.
    const x = index - start - (rowSizes[row]! - 1) / 2;
    const size = rowSizes[target]!;
    const exact = x + (size - 1) / 2;
    const col = Math.min(size - 1, Math.max(0, x < 0 ? Math.floor(exact) : Math.ceil(exact)));
    const targetStart = rowSizes.slice(0, target).reduce((sum, length) => sum + length, 0);
    return targetStart + col;
  };
  let next: number | undefined;
  switch (key.key) {
    case "ArrowRight": next = index + (rtl ? -1 : 1); break;
    case "ArrowLeft": next = index + (rtl ? 1 : -1); break;
    case "ArrowDown": next = across(1); break;
    case "ArrowUp": next = across(-1); break;
    case "Home": next = 0; break;
    case "End": next = count - 1; break;
    default: return undefined;
  }
  return next === undefined || next < 0 || next >= count || next === index ? undefined : next;
}

/** The color wheel's drawing (Fluent UI Blazor's geometry): each hexagon's center and points, and the viewBox. */
export interface WheelLayout {
  readonly viewBox: string;
  readonly hexagons: readonly { readonly cx: number; readonly cy: number; readonly points: string }[];
}

/** Lays out rows of pointy-top hexagons of `size` (center to corner), centered, rows overlapping by a quarter. */
export function wheelLayout(rowSizes: readonly number[], size = 20, padding = 5): WheelLayout {
  const width = Math.sqrt(3) * size;
  const widest = Math.max(...rowSizes);
  const centerX = (widest / 2 + 0.5) * width;
  const round = (value: number): number => Math.round(value * 100) / 100;
  const hexagons: { cx: number; cy: number; points: string }[] = [];
  rowSizes.forEach((count, row) => {
    const cy = padding + size + row * 1.5 * size;
    for (let col = 0; col < count; col++) {
      const cx = centerX + (col - (count - 1) / 2) * width;
      const points = Array.from({ length: 6 }, (_, corner) => {
        const angle = (Math.PI / 180) * (60 * corner - 30);
        return `${round(cx + size * Math.cos(angle))},${round(cy + size * Math.sin(angle))}`;
      }).join(" ");
      hexagons.push({ cx: round(cx), cy: round(cy), points });
    }
  });
  const height = (rowSizes.length - 1) * 1.5 * size + 2 * size + 2 * padding;
  return { viewBox: `0 0 ${round((widest + 1) * width)} ${round(height)}`, hexagons };
}

/** The texts of a color picker (English by default); the component takes them as `labels`. */
export interface ColorPickerLabels {
  /** A swatch's name: "dark blue, #0e47a1". */
  swatch: (color: HexColor) => string;
  /** The saturation and brightness square's name. */
  square: string;
  /** What the square says it is at: "Saturation 80%, brightness 60%". */
  squareValue: (saturation: number, brightness: number) => string;
  /** The hue bar's name. */
  hue: string;
  /** What the hue bar says it is at: "210 degrees, blue". */
  hueValue: (hue: number, color: HexColor) => string;
}

export const colorPickerLabels: ColorPickerLabels = {
  swatch: (color) => `${describeColor(color)}, ${color}`,
  square: "Saturation and brightness",
  squareValue: (saturation, brightness) => `Saturation ${saturation}%, brightness ${brightness}%`,
  hue: "Hue",
  hueValue: (hue, color) => `${hue} degrees, ${describeColor(color)}`,
};

/**
 * A color's name for a screen reader, from its hue and lightness ("dark blue", "light red", "gray") — what a swatch
 * says besides its hex code, so a choice doesn't rest on seeing the color (WCAG 1.4.1).
 */
export function describeColor(text: string): string {
  const hsv = hexToHsv(text);
  if (hsv === undefined) return text;
  const { h, s, v } = hsv;
  const lightness = v * (1 - s / 2);
  if (v < 0.12) return "black";
  if (s < 0.12) return lightness > 0.92 ? "white" : lightness > 0.65 ? "light gray" : lightness < 0.35 ? "dark gray" : "gray";
  // Every 30 degrees; pure blue (240) is "blue", as most people say.
  const names = ["red", "orange", "yellow", "lime", "green", "teal", "cyan", "blue", "blue", "purple", "magenta", "pink"];
  const name = names[Math.round(h / 30) % 12]!;
  return lightness > 0.75 ? `light ${name}` : lightness < 0.35 ? `dark ${name}` : name;
}
