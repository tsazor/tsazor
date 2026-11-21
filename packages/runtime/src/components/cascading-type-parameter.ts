/**
 * Blazor's `[CascadingTypeParameter]`: the component's type parameter flows
 * to the components inside its content that have a type parameter of the same
 * name and are not given one — QuickGrid's columns take `TGridItem` from
 * their grid, so `Property="(o) => o.customer"` sees `o` as the row type.
 *
 * ```tsazor
 * @typeparam TGridItem
 * @attribute @CascadingTypeParameter("TGridItem")
 * ```
 *
 * A compile-time declaration only: the compiler reads it from the component's
 * metadata, the decorator itself does nothing at run time.
 */
export function CascadingTypeParameter(...names: string[]): (value: abstract new (...args: never[]) => unknown, context: ClassDecoratorContext) => void {
  void names;
  return () => undefined;
}
