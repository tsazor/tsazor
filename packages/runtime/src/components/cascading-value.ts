import { ComponentBase } from "./component-base";
import { Parameter } from "./parameter-metadata";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree";
import type { CascadingValueSupplier } from "../renderer/cascading-value";

/**
 * Blazor's CascadingValue: supplies `value` to the subtree below it. Match in
 * the child happens by name (CascadingParameter({ name })) or, for class
 * values, by constructor type (CascadingParameter({ type })). When the value
 * changes, the subtree re-renders (isFixed is always false in v1).
 */
export class CascadingValue extends ComponentBase implements CascadingValueSupplier {
  /** The value to cascade down. */
  @Parameter() value?: unknown;
  /** Optional name to cascade under (matches CascadingParameter({ name })). */
  @Parameter() name?: string;
  /** The subtree receiving the value. */
  @Parameter() childContent?: RenderFragment;
  /** Pass-through attributes (class, id, …) — unused on output. */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;

  readonly isCascadingValueSupplier = true;
  /** False: children re-resolve when the value changes. */
  readonly isFixed = false;
  get cascadeValue(): unknown {
    return this.value;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.childContent?.(b);
  }
}