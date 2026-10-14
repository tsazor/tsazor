/**
 * The design tokens an app may override (FluentProvider's `tokenOverrides`): the brand ramp and the semantic tokens.
 * The other `--fui-*` properties of the token sheet (the theme toggles, the neutral ramp, the controls' and the
 * components' own) are the skin's internals and may change in any release. Types only: the build copies this file
 * as `tokens.d.ts`.
 */

/** A step of the brand ramp, 10 (darkest) to 160 (lightest); 80 is the primary brand color. */
export type FluentBrandStep = 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 | 110 | 120 | 130 | 140 | 150 | 160;

/** A token `tokenOverrides` takes: `{ "--fui-brand-80": "#8a2be2", "--fui-radius-md": "8px" }`. */
export type FluentToken =
  // The brand ramp: the accent and the brand fills derive from it, in both themes.
  | `--fui-brand-${FluentBrandStep}`
  // Surfaces, text and lines.
  | "--fui-background-1"
  | "--fui-background-2"
  | "--fui-background-3"
  | "--fui-background-4"
  | "--fui-background-5"
  | "--fui-foreground-1"
  | "--fui-foreground-2"
  | "--fui-foreground-3"
  | "--fui-foreground-disabled"
  | "--fui-foreground-on-brand"
  | "--fui-stroke-1"
  | "--fui-stroke-2"
  // The interaction color and the fills behind on-brand text.
  | "--fui-accent"
  | "--fui-accent-hover"
  | "--fui-accent-active"
  | "--fui-brand-background"
  | "--fui-brand-background-hover"
  | "--fui-brand-background-pressed"
  // Shape, space, type and motion.
  | "--fui-radius-none"
  | "--fui-radius-sm"
  | "--fui-radius-md"
  | "--fui-radius-lg"
  | "--fui-radius-circular"
  | "--fui-spacing-xs"
  | "--fui-spacing-s"
  | "--fui-spacing-m"
  | "--fui-spacing-l"
  | "--fui-spacing-xl"
  | "--fui-spacing-xxl"
  | "--fui-spacing-xxxl"
  | "--fui-font-family"
  | "--fui-font-family-mono"
  | "--fui-font-size-caption"
  | "--fui-font-size-caption-lg"
  | "--fui-font-size-body"
  | "--fui-font-size-body-lg"
  | "--fui-font-size-subtitle"
  | "--fui-font-size-title"
  | "--fui-font-size-display"
  | "--fui-font-weight-regular"
  | "--fui-font-weight-semibold"
  | "--fui-font-weight-bold"
  | "--fui-line-height"
  | "--fui-line-height-caption"
  | "--fui-duration-fast"
  | "--fui-duration-normal"
  | "--fui-duration-gentle"
  | "--fui-duration-slow"
  | "--fui-ease-standard"
  | "--fui-ease-decelerate"
  | "--fui-ease-accelerate"
  | "--fui-shadow-2"
  | "--fui-shadow-4"
  | "--fui-shadow-8"
  | "--fui-shadow-16"
  | "--fui-shadow-28";

/** FluentProvider's `tokenOverrides`: a value for any of the public tokens, as CSS text. */
export type FluentTokenOverrides = Partial<Record<FluentToken, string>>;
