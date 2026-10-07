/**
 * The shared vocabulary of the Tsazor skins (design-component-library.md §3):
 * the same parameter means the same thing in `@tsazor/bootstrap` and
 * `@tsazor/fluent`, so switching the skin is a change of `@using`, not a
 * rewrite. A skin maps each value to its design system.
 */

/** What a control means: its color role. */
export type Intent = "primary" | "secondary" | "success" | "danger" | "warning" | "info" | "neutral";

/** How much visual weight a control carries. */
export type Appearance = "solid" | "outline" | "subtle" | "transparent";

/** Control size. */
export type Size = "small" | "medium" | "large";

/** Where a floating element sits relative to its anchor. */
export type Placement =
  | "top"
  | "top-start"
  | "top-end"
  | "bottom"
  | "bottom-start"
  | "bottom-end"
  | "left"
  | "left-start"
  | "left-end"
  | "right"
  | "right-start"
  | "right-end";

/** Layout direction. */
export type Orientation = "horizontal" | "vertical";
