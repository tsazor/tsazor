import type { ComponentBase } from "./component-base.js";

/**
 * Tsazor extension (F6): a field whose assignment renders its component.
 * `@State() accessor seconds = 0;` makes `this.seconds = v` the same as
 * `this.seconds = v; this.stateHasChanged();` — so a timer, a callback or a
 * message can change state without the explicit call.
 *
 * ```ts
 * @State() accessor seconds = 0;
 *
 * start() {
 *     setInterval(() => this.seconds++, 1000);
 * }
 * ```
 *
 * - Renders are queued and coalesced like `stateHasChanged()`;
 *   `shouldRender()` is consulted; assigning an `Object.is`-equal value does
 *   nothing.
 * - **Shallow:** only assignment counts. `this.items.push(x)` is not seen —
 *   write `this.items = [...this.items, x]`, or call `stateHasChanged()`.
 * - Quiet before the component's first render and while it builds its
 *   render tree.
 * - Not for parameters: the parent's value would overwrite it.
 *
 * Needs `accessor`: standard field decorators cannot intercept assignments.
 */
export function State<This extends ComponentBase, V>(): (
  target: ClassAccessorDecoratorTarget<This, V>,
  context: ClassAccessorDecoratorContext<This, V>,
) => ClassAccessorDecoratorResult<This, V> {
  return (_target, context) => {
    if ((context as { kind?: string } | null)?.kind !== "accessor") {
      const name = String((context as { name?: unknown } | null)?.name ?? "");
      throw new Error(`@State() needs an auto-accessor: write 'accessor ${name}' (standard field decorators cannot intercept assignments).`);
    }
    // A stable key (not the accessor's private slot): the value survives a hot swap of the class.
    const store = Symbol.for(`tsazor.state.${String(context.name)}`);
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
        this.stateFieldChangedInternal();
      },
    };
  };
}
