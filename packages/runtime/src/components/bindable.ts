import { componentInternals } from "./component-internals.js";
import type { ComponentBase } from "./component-base.js";
import type { EventCallback } from "./event-callback.js";
import { register } from "./parameter-metadata.js";

/** Options of `@Bindable()`. */
export interface BindableOptions {
  /**
   * Name of the change callback parameter (default `<name>Changed`), e.g.
   * `"onPick"` for a parent that binds with `@bind-Value:event="OnPick"`.
   */
  changed?: string;
  /**
   * Also declare `<name>Expression` (a `string` parameter, the field name an
   * `EditContext` validates — InputBase's v1 contract).
   */
  expression?: boolean;
}

/**
 * Tsazor extension: a two-way component parameter on an auto-accessor.
 * `@Bindable() accessor value = 0;` is exactly
 *
 * ```ts
 * @Parameter() value = 0;
 * @Parameter() valueChanged?: EventCallback<number>;
 * ```
 *
 * plus one behavior: assigning `this.value` in the component sets the value
 * and invokes `valueChanged` with it (not for an `Object.is`-equal value).
 * The callback runs in the background: its errors take the event handler
 * error path; code that must await it calls
 * `await this.valueChanged?.invokeAsync(v)` itself. Parameter values the
 * parent passes are written without invoking it, and without a binding the
 * value just changes locally.
 *
 * Needs `accessor`: standard field decorators cannot intercept assignments.
 */
export function Bindable<This extends ComponentBase, V>(
  options?: BindableOptions,
): (target: ClassAccessorDecoratorTarget<This, V>, context: ClassAccessorDecoratorContext<This, V>) => ClassAccessorDecoratorResult<This, V> {
  return (_target, context) => {
    if ((context as { kind?: string } | null)?.kind !== "accessor") {
      const name = String((context as { name?: unknown } | null)?.name ?? "");
      throw new Error(`@Bindable() needs an auto-accessor: write 'accessor ${name}' (standard field decorators cannot intercept assignments).`);
    }
    const name = String(context.name);
    const changed = options?.changed ?? `${name}Changed`;
    // A stable key (not the accessor's private slot): the value survives a hot swap of the class.
    const store = Symbol.for(`tsazor.bindable.${name}`);
    register(context, "@Bindable()", { store });
    register(context, "@Bindable()", {}, changed);
    if (options?.expression) register(context, "@Bindable()", {}, `${name}Expression`);
    type Slots = Record<PropertyKey, unknown>;
    return {
      init(this: This, value: V): V {
        (this as unknown as Slots)[store] = value;
        return value;
      },
      get(this: This): V {
        return (this as unknown as Slots)[store] as V;
      },
      set(this: This, value: V): void {
        const slots = this as unknown as Slots;
        if (Object.is(slots[store], value)) return;
        slots[store] = value;
        const callback = slots[changed] as EventCallback<V> | ((value: V) => unknown) | null | undefined;
        if (callback != null) invokeChanged(this, callback, value);
      },
    };
  };
}

/** Fire and forget: the callback's failure is routed like an event handler's. */
function invokeChanged<V>(component: ComponentBase, callback: EventCallback<V> | ((value: V) => unknown), value: V): void {
  let pending: Promise<unknown>;
  try {
    pending = Promise.resolve(typeof callback === "function" ? callback(value) : callback.invokeAsync(value));
  } catch (error) {
    pending = Promise.reject(error);
  }
  const handled = pending.then(undefined, (error) => componentInternals.reportError(component, error, "event"));
  componentInternals.renderHandle(component)?.track(handled);
}
