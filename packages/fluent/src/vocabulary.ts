/**
 * The shared vocabulary (design-component-library.md §3) mapped to Fluent 2:
 * an `Intent` becomes one of Fluent's color roles — the brand color for
 * `primary`, the neutral palette for `secondary`/`neutral`, and the status
 * colors (Bootstrap's skin maps the same intents to its own classes).
 */
import type { Appearance, Intent, Size } from "@tsazor/ui";

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

/** The classes of a Fluent button (Button, a Menu's toggle) for an intent, an appearance and a size. */
export function buttonClasses(intent: Intent, appearance: Appearance, size: Size): string {
    const color = fluentColor(intent);
    let cls = "fui-button";
    if (appearance === "solid") {
        // Neutral is Fluent's default button; brand and the status colors fill it.
        if (color === "brand") cls += " fui-button--primary";
        else if (color !== "neutral") cls += ` fui-button--primary fui-button--${color}`;
    } else {
        cls += ` fui-button--${appearance}`;
        if (color !== "neutral") cls += ` fui-button--ink-${color}`;
    }
    if (size === "small") cls += " fui-button--small";
    else if (size === "large") cls += " fui-button--large";
    return cls;
}
