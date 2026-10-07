/**
 * The shared vocabulary (`@tsazor/ui`) mapped to Bootstrap 5.3 classes.
 * Bootstrap has no "neutral" color: backgrounds use `light`, text uses
 * `secondary`.
 */
import type { Appearance, Intent, Size } from "@tsazor/ui";

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
