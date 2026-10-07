/**
 * The shared vocabulary (design-component-library.md §3) mapped to Fluent 2:
 * an `Intent` becomes one of Fluent's color roles — the brand color for
 * `primary`, the neutral palette for `secondary`/`neutral`, and the status
 * colors (Bootstrap's skin maps the same intents to its own classes).
 */
import type { Appearance, Intent } from "@tsazor/ui";

/** Fluent's color roles. */
export type FluentColor = "brand" | "neutral" | "success" | "warning" | "danger" | "info";

/** The Fluent color role of an intent. */
export function fluentColor(intent: Intent): FluentColor {
    switch (intent) {
        case "primary":
            return "brand";
        case "secondary":
        case "neutral":
            return "neutral";
        default:
            return intent;
    }
}

/** A status surface's color (message bars, toasts, indicators): primary reads as info there. */
export function statusColor(intent: Intent): Exclude<FluentColor, "brand"> {
    const color = fluentColor(intent);
    return color === "brand" ? "info" : color;
}

/** Fluent's name for an appearance: `solid` is Fluent's "filled". */
export function fluentAppearance(appearance: Appearance): "filled" | "outline" | "subtle" | "transparent" {
    return appearance === "solid" ? "filled" : appearance;
}
