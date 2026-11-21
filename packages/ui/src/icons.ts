/**
 * What an icon is (design-icons.md): the inner markup of an SVG and its viewBox, drawn in `currentColor` by a skin's
 * `Icon`. The generated sets export these; an app makes its own with `icon()`.
 */
export interface IconValue {
  /** The icon's name, for titles and tests ("save"). */
  readonly name: string;
  /** The SVG's viewBox ("0 0 20 20"). */
  readonly viewBox: string;
  /**
   * The SVG's inner markup (`<path d="…"/>`), rendered as markup. Trusted: it comes from a package or from the app's
   * own code, never from user input.
   */
  readonly content: string;
}

const DEFAULT_VIEW_BOX = "0 0 24 24";

/**
 * The root attributes an icon's drawing inherits: an outline icon says `fill="none" stroke="currentColor"` on its
 * `<svg>`, not on each path.
 */
const PRESENTATION = [
  "fill", "fill-rule", "fill-opacity", "clip-rule", "opacity",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "stroke-dasharray", "stroke-opacity",
];

/**
 * An app's own icon (Fluent UI Blazor's `new Icon(name, variant, size, content)`): the inner markup of an SVG, or a
 * whole `<svg>`, whose viewBox (else its width and height) is kept. Without either, the viewBox is `0 0 24 24`. A whole
 * `<svg>`'s fill and stroke attributes move onto a `<g>` around its content, so an outline icon stays an outline under
 * the skins' `fill="currentColor"`.
 */
export function icon(name: string, svg: string, viewBox?: string): IconValue {
  const whole = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i.exec(svg);
  if (whole === null) return { name, viewBox: viewBox ?? DEFAULT_VIEW_BOX, content: svg.trim() };
  const attributes = whole[1] ?? "";
  const attribute = (attributeName: string): string | undefined =>
    new RegExp(`(?:^|\\s)${attributeName}\\s*=\\s*["']([^"']*)["']`, "i").exec(attributes)?.[1];
  const width = Number.parseFloat(attribute("width") ?? "");
  const height = Number.parseFloat(attribute("height") ?? "");
  const sized = width > 0 && height > 0 ? `0 0 ${width} ${height}` : undefined;
  const inner = (whole[2] ?? "").trim();
  const inherited = PRESENTATION.flatMap((attributeName) => {
    const value = attribute(attributeName);
    // The skins' Icon draws in currentColor already.
    if (value === undefined || (attributeName === "fill" && value === "currentColor")) return [];
    return [`${attributeName}="${value}"`];
  });
  const content = inherited.length === 0 ? inner : `<g ${inherited.join(" ")}>${inner}</g>`;
  return { name, viewBox: viewBox ?? attribute("viewBox") ?? sized ?? DEFAULT_VIEW_BOX, content };
}

/**
 * The size an icon is drawn at when nothing sets one (Fluent UI Blazor's `FluentIcon` takes the icon's size): its
 * viewBox width, so `Icons.Regular.Size20.Save` is 20px and a Bootstrap icon 16px. 16 when the viewBox has none.
 */
export function iconSize(value: IconValue): number {
  const width = Number.parseFloat(value.viewBox.trim().split(/[\s,]+/)[2] ?? "");
  return width > 0 ? width : 16;
}
