/**
 * Duck-typed contract for components that supply cascading values to their
 * subtree (Blazor's ICascadingValueSupplier). Implemented by the
 * CascadingValue component in @tsazor/components.
 */
export interface CascadingValueSupplier {
  readonly isCascadingValueSupplier: true;
  readonly cascadeValue: unknown;
  readonly cascadeName?: string;
  readonly isFixed: boolean;
}

export function isCascadingValueSupplier(value: unknown): value is CascadingValueSupplier {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { isCascadingValueSupplier?: unknown }).isCascadingValueSupplier === true
  );
}