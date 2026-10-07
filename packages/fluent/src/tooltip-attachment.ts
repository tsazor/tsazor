/**
 * The Fluent UI 2 look of the core's tooltip behavior: `.fui-tooltip` with a
 * `.fui-tooltip__content`. Exported by the package as `tooltip`:
 * `<button @attach="tooltip('Save')">`.
 */
import { tooltip as coreTooltip, type Placement } from "@tsazor/ui";
import type { Attachment } from "@tsazor/runtime";

/** A Fluent tooltip on any element; the same text gives the same attachment. */
export function tooltip(text: string, placement: Placement = "top"): Attachment<HTMLElement> {
  return coreTooltip(text, { placement, className: "fui-tooltip", innerClassName: "fui-tooltip__content" });
}
