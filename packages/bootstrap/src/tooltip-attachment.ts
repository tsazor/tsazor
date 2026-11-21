/**
 * The Bootstrap look of the core's tooltip behavior: `.tooltip.show` with a
 * `.tooltip-inner`. Exported by the package as `tooltip`:
 * `<button @attach="tooltip('Save')">`.
 */
import { tooltip as coreTooltip, type Placement } from "@tsazor/ui";
import type { Attachment } from "@tsazor/runtime";

/** A Bootstrap tooltip on any element; the same text gives the same attachment. */
export function tooltip(text: string, placement: Placement = "top"): Attachment<HTMLElement> {
  return coreTooltip(text, { placement, className: "tooltip show", innerClassName: "tooltip-inner" });
}
