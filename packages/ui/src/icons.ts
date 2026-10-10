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

/** A built-in stroke icon on a 20px grid (the skins' small set, drawn with round 1.5px strokes). */
function stroke(name: string, d: string): IconValue {
  return {
    name,
    viewBox: "0 0 20 20",
    content: `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  };
}

/**
 * The small set both skins' `Icon` draws by `name` (chevrons, close, check, arrows, search, add, remove, files). The
 * full sets are the generated packages; this one stays so `name="close"` keeps working.
 * @deprecated Use a generated set (`@tsazor/fluent-icons`, `@tsazor/bootstrap-icons`) or `icon()`.
 */
export const builtInIcons: Readonly<Record<string, IconValue>> = Object.freeze(
  Object.fromEntries(
    [
      stroke("chevron-left", "M12 3L5 10l7 7"),
      stroke("chevron-right", "M8 3l7 7-7 7"),
      stroke("close", "M3 3l14 14M17 3L3 17"),
      stroke("check", "M3 11l5 5L17 6"),
      stroke("arrow-left", "M17 10H3m0 0l6-6m-6 6l6 6"),
      stroke("arrow-right", "M3 10h14m0 0l-6-6m6 6l-6 6"),
      stroke("arrow-up", "M10 17V3m0 0L4 9m6-6l6 6"),
      stroke("arrow-down", "M10 3v14m0 0l6-6m-6 6l-6-6"),
      stroke("search", "M9 3a6 6 0 100 12A6 6 0 009 3zm9 15l-4.3-4.3"),
      stroke("add", "M10 3v14M3 10h14"),
      stroke("remove", "M3 10h14"),
      stroke("folder", "M2.5 5.5a1 1 0 011-1h4l2 2h7a1 1 0 011 1v8a1 1 0 01-1 1h-13a1 1 0 01-1-1z"),
      stroke("folder-up", "M2.5 5.5a1 1 0 011-1h4l2 2h7a1 1 0 011 1v8a1 1 0 01-1 1h-13a1 1 0 01-1-1zM10 14V9.5m0 0L7.5 12M10 9.5l2.5 2.5"),
      stroke("document", "M5.5 2.5h6l3.5 3.5v10.5a1 1 0 01-1 1h-8.5a1 1 0 01-1-1v-13a1 1 0 011-1zM11.5 2.5V6h3.5"),
      stroke("image", "M3.5 3.5h13v13h-13zM3.5 13.5l4-4 3.5 3.5 2-2 3.5 3.5M12.5 6.5a1 1 0 100 2 1 1 0 000-2z"),
      stroke("download", "M10 3v10m0 0l-4-4m4 4l4-4M3.5 16.5h13"),
    ].map((value) => [value.name, value]),
  ),
);
