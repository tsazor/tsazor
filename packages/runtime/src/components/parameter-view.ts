import type { RenderFragment } from "../render-tree/render-tree.js";
import type { ComponentBase } from "./component-base.js";

/**
 * Blazor's ParameterView: the set of parameters a parent wrote into a
 * component frame for one render pass.
 */
export class ParameterView {
  private readonly values: ReadonlyMap<string, unknown>;

  private constructor(values: Map<string, unknown>) {
    this.values = values;
  }

  /** Creates a view from `[name, value]` pairs; a repeated name keeps its last value. */
  static fromAttributes(entries: Iterable<[string, unknown]>): ParameterView {
    return new ParameterView(new Map(entries));
  }

  /** Blazor's ParameterView.Empty: a view without parameters (a new instance per call). */
  static empty(): ParameterView {
    return new ParameterView(new Map());
  }

  /** Blazor's GetValueOrDefault: the value of parameter `name` (exact, case-sensitive name), or `undefined`. The type argument is not checked. */
  getValue<T = unknown>(name: string): T | undefined {
    return this.values.get(name) as T | undefined;
  }

  /** Whether the parent supplied parameter `name` (exact, case-sensitive name), even with the value `undefined`. */
  has(name: string): boolean {
    return this.values.has(name);
  }

  /** RenderFragment passed as the component's child content. */
  getChildContent(): RenderFragment | undefined {
    return this.values.get("ChildContent") as RenderFragment | undefined;
  }

  /** Blazor's SetParameterProperties: writes the parameters into the component's `@Parameter` properties via `applyParameterValues` (throws on an undeclared parameter without a captureUnmatchedValues property). */
  setParameterProperties(component: ComponentBase): void {
    component.applyParameterValues(this);
  }

  /** Blazor's ToDictionary: the parameters as a new plain object. */
  toDictionary(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.values) {
      result[key] = value;
    }
    return result;
  }

  /** The parameters as a new array of `[name, value]` pairs, in the order the parent wrote them. */
  entries(): Array<[string, unknown]> {
    return [...this.values.entries()];
  }
}