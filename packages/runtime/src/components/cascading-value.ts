import { ComponentBase } from "./component-base.js";
import { Parameter } from "./parameter-metadata.js";
import type { ParameterView } from "./parameter-view.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { CascadingValueSupplier } from "../renderer/cascading-value.js";

/**
 * Blazor's CascadingValue: supplies `value` to the subtree below it. Match in
 * the child happens by name (`Name` ↔ CascadingParameter({ name }),
 * case-insensitive) or, when neither side has a name, by type
 * (CascadingParameter({ type }) against the value's runtime type). Consumers
 * subscribe (unless `isFixed`): when the value may have changed, they get
 * their parameters re-set directly, even when the components in between do
 * not re-render.
 */
export class CascadingValue extends ComponentBase implements CascadingValueSupplier {
  /** The value to cascade down. */
  @Parameter() value?: unknown;
  /** Optional name to cascade under (matches CascadingParameter({ name })). */
  @Parameter() name?: string;
  /** Blazor's IsFixed: the value never changes — consumers do not subscribe. Cannot change after the first render. */
  @Parameter() isFixed = false;
  /** The subtree receiving the value. */
  @Parameter() childContent?: RenderFragment;
  /** Pass-through attributes (class, id, …) — unused on output. */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;

  readonly isCascadingValueSupplier = true;
  private initialIsFixed?: boolean;

  get cascadeValue(): unknown {
    return this.value;
  }

  get cascadeName(): string | undefined {
    return this.name ?? undefined;
  }

  protected override applyParameterValues(parameters: ParameterView): void {
    super.applyParameterValues(parameters);
    // Blazor: consumers decided at resolution time whether to subscribe.
    if (this.initialIsFixed === undefined) {
      this.initialIsFixed = this.isFixed;
    } else if (this.isFixed !== this.initialIsFixed) {
      throw new Error("The value of IsFixed cannot be changed dynamically.");
    }
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.childContent?.(b);
  }
}
