import type { RenderFragment } from "../render-tree/render-tree";
import type { ComponentBase } from "./component-base";

/**
 * Blazor's ParameterView: the set of parameters a parent wrote into a
 * component frame for one render pass.
 */
export class ParameterView {
  private readonly values: ReadonlyMap<string, unknown>;

  private constructor(values: Map<string, unknown>) {
    this.values = values;
  }

  static fromAttributes(entries: Iterable<[string, unknown]>): ParameterView {
    return new ParameterView(new Map(entries));
  }

  static empty(): ParameterView {
    return new ParameterView(new Map());
  }

  getValue<T = unknown>(name: string): T | undefined {
    return this.values.get(name) as T | undefined;
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  /** RenderFragment passed as the component's child content. */
  getChildContent(): RenderFragment | undefined {
    return this.values.get("ChildContent") as RenderFragment | undefined;
  }

  setParameterProperties(component: ComponentBase): void {
    component.applyParameterValues(this);
  }

  toDictionary(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.values) {
      result[key] = value;
    }
    return result;
  }

  entries(): Array<[string, unknown]> {
    return [...this.values.entries()];
  }
}