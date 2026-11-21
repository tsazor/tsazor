/**
 * The shared vocabulary (`@tsazor/ui`) mapped to Bootstrap 5.3 classes.
 * Bootstrap has no "neutral" color: backgrounds use `light`, text uses
 * `secondary`.
 */
import type { Appearance, AvatarColor, AvatarNamedColor, Intent, Size } from "@tsazor/ui";

/** Bootstrap's color name for an intent, as a background (`btn-*`, `alert-*`, `bg-*`). */
export function backgroundColor(intent: Intent): string {
  return intent === "neutral" ? "light" : intent;
}

/** Bootstrap's color name for an intent, as text (`text-*`). */
export function textColor(intent: Intent): string {
  return intent === "neutral" ? "secondary" : intent;
}

/** The `.btn` classes of an intent and appearance. */
export function buttonClasses(intent: Intent, appearance: Appearance, size: Size): string {
  const color = backgroundColor(intent);
  const parts = ["btn"];
  switch (appearance) {
    case "outline":
      parts.push(`btn-outline-${color}`);
      break;
    case "subtle":
      // Bootstrap 5.3's subtle colors: a light tint with emphasized text.
      parts.push(`bg-${textColor(intent)}-subtle`, `text-${textColor(intent)}-emphasis`, "border-0");
      break;
    case "transparent":
      parts.push("btn-link", `link-${textColor(intent)}`);
      break;
    default:
      parts.push(`btn-${color}`);
  }
  const suffix = sizeSuffix(size);
  if (suffix) parts.push(`btn-${suffix}`);
  return parts.join(" ");
}

/** Bootstrap's size suffix (`sm`, `lg`), or "" for medium. */
export function sizeSuffix(size: Size): string {
  return size === "small" ? "sm" : size === "large" ? "lg" : "";
}

/**
 * Bootstrap's hue (a `--bs-*` color) for one of Fluent's avatar colors: Bootstrap has ten hues and two grays, so
 * neighbouring Fluent colors share one (dark-red, cranberry and red are all red).
 */
const AVATAR_HUES: Readonly<Record<AvatarNamedColor, string>> = {
  "dark-red": "red", cranberry: "red", red: "red", pumpkin: "orange", peach: "orange", marigold: "yellow",
  gold: "yellow", brass: "yellow", brown: "orange", forest: "green", seafoam: "teal", "dark-green": "green",
  "light-teal": "cyan", teal: "teal", steel: "cyan", blue: "blue", "royal-blue": "blue", cornflower: "indigo",
  navy: "indigo", lavender: "purple", purple: "purple", grape: "purple", lilac: "purple", pink: "pink",
  magenta: "pink", plum: "pink", beige: "gray", mink: "gray", platinum: "gray", anchor: "gray-dark",
};

/**
 * An avatar's colors in Bootstrap's variables: a tint of the hue behind the emphasis text color (dark on light, light
 * on dark), so the initials always contrast; the hue itself for the active ring.
 */
export function avatarColors(color: AvatarColor): { background: string; foreground: string; ring: string } {
  if (color === "neutral" || color === "colorful") return { background: "var(--bs-secondary-bg)", foreground: "var(--bs-emphasis-color)", ring: "var(--bs-primary)" };
  if (color === "brand") return { background: "var(--bs-primary)", foreground: "var(--bs-white)", ring: "var(--bs-primary)" };
  const hue = `var(--bs-${AVATAR_HUES[color]})`;
  return { background: `color-mix(in srgb, ${hue} 30%, var(--bs-body-bg))`, foreground: "var(--bs-emphasis-color)", ring: hue };
}
