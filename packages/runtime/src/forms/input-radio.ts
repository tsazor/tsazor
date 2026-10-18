import { ComponentBase } from "../components/component-base.js";
import { CascadingParameter, Parameter } from "../components/parameter-metadata.js";
import { EventCallback } from "../components/event-callback.js";
import type { RenderFragment, RenderTreeBuilder } from "../render-tree/render-tree.js";
import type { CascadingValueSupplier } from "../renderer/cascading-value.js";
import { InputBase } from "./input-base.js";

/**
 * Blazor's InputRadioContext: what an InputRadioGroup cascades to its InputRadio components — the radios' shared
 * name, the group's value, its validation class and how a radio chooses.
 */
export class InputRadioContext {
  /** Built by the InputRadioGroup on each parameter set. */
  constructor(
    /** The group around this one (a radio may name an enclosing group). */
    readonly parentContext: InputRadioContext | undefined,
    /** The radios' shared `name` attribute. */
    readonly groupName: string,
    /** The group's value: the radio whose value equals it is checked. */
    readonly currentValue: unknown,
    /** The group's validation class (EditContext.fieldCssClass), on every radio. */
    readonly fieldClass: string,
    /** Makes `value` the group's value — a radio was chosen. */
    readonly select: (value: unknown) => void,
  ) {}

  /** This group's context or an enclosing one's, by group name (Blazor's FindContextInAncestors). */
  findContextInAncestors(groupName: string): InputRadioContext | undefined {
    return this.groupName === groupName ? this : this.parentContext?.findContextInAncestors(groupName);
  }
}

let nextGroupId = 0;

/**
 * Blazor's InputRadioGroup<TValue>: binds one value to the InputRadio components inside it (`@bind-Value`, as every
 * input). It renders no element of its own — only its content — and cascades an InputRadioContext; a new context
 * per parameter set is what makes the radios render again when the value changes. `Name` names the radios' group
 * (a unique one when absent), so an InputRadio inside a nested group can pick this one.
 */
export class InputRadioGroup<TValue> extends InputBase<TValue> implements CascadingValueSupplier {
  /** The InputRadio components, and any markup around them. */
  @Parameter() childContent?: RenderFragment;
  /** The radios' `name` attribute; generated when absent. */
  @Parameter() name?: string;
  /** An enclosing group's context (Blazor's CascadedContext). */
  @CascadingParameter({ type: InputRadioContext }) cascadedContext?: InputRadioContext;

  readonly isCascadingValueSupplier = true;
  readonly isFixed = false;
  readonly cascadeType = InputRadioContext;
  readonly #defaultName = `tz-radio-group-${++nextGroupId}`;
  #context: InputRadioContext | undefined;

  /** The InputRadioContext the radios receive. */
  get cascadeValue(): unknown {
    return this.#context;
  }

  protected override onParametersSet(): void {
    this.#context = this.createContext();
  }

  private createContext(): InputRadioContext {
    return new InputRadioContext(this.cascadedContext, this.name || this.#defaultName, this.currentValue, this.fieldClass, (value) => {
      this.currentValue = value as TValue;
      // Without a two-way bind no new parameters come: the group shows the choice itself.
      this.#context = this.createContext();
      this.stateHasChanged();
    });
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    this.childContent?.(b);
  }
}

/**
 * Blazor's InputRadio<TValue>: one radio button of the enclosing InputRadioGroup — checked while the group's value
 * equals `Value`, and choosing it makes `Value` the group's value. `Name` picks an enclosing group by its name.
 * Without a group it throws, as Blazor's.
 */
export class InputRadio<TValue> extends ComponentBase {
  /** The value the group takes when this radio is chosen. */
  @Parameter() value?: TValue;
  /** The group to belong to, by its `Name` — for a radio inside a nested group. */
  @Parameter() name?: string;
  /** Pass-through attributes (class, id, disabled, …). */
  @Parameter({ captureUnmatchedValues: true }) additionalAttributes?: Record<string, unknown>;
  /** The nearest group's context. */
  @CascadingParameter({ type: InputRadioContext }) cascadedContext?: InputRadioContext;
  /** The rendered `<input type="radio">` (Blazor's Element). */
  element?: HTMLElement;

  #context: InputRadioContext | undefined;

  protected override onParametersSet(): void {
    const context = this.name ? this.cascadedContext?.findContextInAncestors(this.name) : this.cascadedContext;
    if (context === undefined) {
      throw new Error(this.name ? `InputRadio could not find an associated InputRadioGroup with name '${this.name}'.` : "InputRadio must have an InputRadioGroup ancestor.");
    }
    this.#context = context;
  }

  protected override buildRenderTree(b: RenderTreeBuilder): void {
    const context = this.#context!;
    const { class: userClass, ...attributes } = this.additionalAttributes ?? {};
    const className = [typeof userClass === "string" ? userClass : "", context.fieldClass].filter(Boolean).join(" ");
    b.openElement(0, "input");
    b.addMultipleAttributes(1, attributes);
    if (className) b.addAttribute(2, "class", className);
    b.addAttribute(3, "type", "radio");
    b.addAttribute(4, "name", context.groupName);
    b.addAttribute(5, "value", this.value === undefined || this.value === null ? "" : String(this.value));
    b.addAttribute(6, "checked", Object.is(context.currentValue, this.value));
    b.addEventHandler(7, "onchange", EventCallback.bind(this, () => context.select(this.value)));
    b.addElementReferenceCapture(8, (element) => {
      this.element = element as HTMLElement;
    });
    b.closeElement();
  }
}
