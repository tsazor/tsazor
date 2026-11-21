import { ComponentBase } from "./component-base.js";
import { Parameter } from "./parameter-metadata.js";
import { toComponentDefinition, type ComponentType } from "./component-definition.js";
import type { RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { ParameterView } from "./parameter-view.js";

/**
 * Blazor's DynamicComponent: renders another component chosen at runtime.
 * `type` is the component class (or a ComponentDefinition from the compiler);
 * `parameters` is the dictionary passed verbatim to the rendered component.
 * `instance` receives the rendered child via the component reference capture —
 * it is intentionally NOT a parameter: in markup only `Type` and `Parameters`
 * are accepted, anything else throws pointing at the `parameters` dictionary
 * (Blazor's InvalidOperationException in DynamicComponent.SetParametersAsync).
 */
export class DynamicComponent extends ComponentBase {
  /** The component type to render. Must not be null when parameters are set. */
  @Parameter() type: ComponentType | null = null;
  /** Parameters handed to the dynamically rendered component. */
  @Parameter() parameters?: Record<string, unknown>;
  /** Blazor's Instance: the rendered component instance. */
  instance: ComponentBase | null = null;

  protected override applyParameterValues(parameters: ParameterView): void {
    // Blazor's manual parameter assignment accepts only Type and Parameters
    // (case-insensitive) and rejects everything else BEFORE assigning anything.
    for (const [name] of parameters.entries()) {
      const lower = name.toLowerCase();
      if (lower !== "type" && lower !== "parameters") {
        throw new Error(
          `DynamicComponent does not accept a parameter with the name '${name}'. ` +
            `To pass parameters to the dynamically-rendered component, use the 'Parameters' parameter.`,
        );
      }
    }
    super.applyParameterValues(parameters);
    // Blazor throws this AFTER the assignment loop, so an invalid extra
    // parameter is reported first.
    if (this.type === null) {
      throw new Error("DynamicComponent requires a non-null value for the parameter Type.");
    }
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    // toComponentDefinition normalizes class → definition; defineComponent's
    // cache keeps the definition identical across renders, so the diff updates
    // (not replaces) the child when only the parameters change and replaces it
    // when the type changes — Blazor's component-diffing semantics.
    b.openComponent(0, toComponentDefinition(this.type as ComponentType));
    if (this.parameters !== undefined) {
      let sequence = 1;
      for (const [name, value] of Object.entries(this.parameters)) {
        b.addAttribute(sequence++, name, value as never);
      }
      b.addComponentReferenceCapture(sequence, (component) => {
        this.instance = component;
      });
    } else {
      b.addComponentReferenceCapture(1, (component) => {
        this.instance = component;
      });
    }
    b.closeComponent();
  }
}