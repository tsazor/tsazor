import type { CascadingTypeToken } from "../components/parameter-metadata.js";

/**
 * Duck-typed contract for components that supply cascading values to their
 * subtree (Blazor's ICascadingValueSupplier). Implemented by the
 * CascadingValue component and built-ins like EditForm and
 * CascadingAuthenticationState.
 *
 * Subscriptions (Blazor's Subscribe/Unsubscribe) are kept by the renderer:
 * a consumer subscribes to every non-fixed supplier its cascading parameters
 * resolve to; whenever the supplier renders and its `cascadeValue` may have
 * changed (ChangeDetection.MayHaveChanged), the subscribers get their
 * parameters re-set directly — regardless of whether the components in
 * between re-render. A supplier therefore only has to re-render when its
 * value changes (CascadingValue does so on every parameter set, like Blazor's).
 */
export interface CascadingValueSupplier {
  /** Marker the renderer detects suppliers by (see `isCascadingValueSupplier`). */
  readonly isCascadingValueSupplier: true;
  /** The value supplied to matching cascading parameters in the subtree. */
  readonly cascadeValue: unknown;
  /** Matches `CascadingParameter({ name })`, case-insensitive (Blazor's CascadingValue.Name). */
  readonly cascadeName?: string;
  /**
   * The static type of the value (Blazor's TValue) for by-type matching.
   * Without it an unnamed supplier matches by the runtime value
   * (`instanceof`), which is undecidable while the value is null/undefined.
   */
  readonly cascadeType?: abstract new (...args: never[]) => unknown;
  /** Blazor's IsFixed: the value never changes, consumers do not subscribe. */
  readonly isFixed: boolean;
}

/** Whether `value` is a component implementing `CascadingValueSupplier` (its `isCascadingValueSupplier` marker is `true`). */
export function isCascadingValueSupplier(value: unknown): value is CascadingValueSupplier {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { isCascadingValueSupplier?: unknown }).isCascadingValueSupplier === true
  );
}

/** What a cascading parameter requests (from its @CascadingParameter metadata). */
export interface CascadingParameterRequest {
  readonly cascadingName?: string;
  readonly cascadingType?: CascadingTypeToken;
}

/**
 * Result of Blazor's ICascadingValueSupplier.CanSupplyValue. "pending": an
 * unnamed supplier without a static type whose value is null/undefined — it
 * may match once it has a value, so the consumer subscribes to it but keeps
 * looking further up.
 */
export type SupplyMatch = "yes" | "no" | "pending";

/**
 * Blazor's CascadingValue.CanSupplyValue: when neither the parameter nor the
 * supplier has a name, match by type (a parameter without a type token takes
 * the nearest unnamed supplier); otherwise match by name alone,
 * case-insensitive. A named supplier never matches a by-type request.
 */
export function canSupplyValue(supplier: CascadingValueSupplier, request: CascadingParameterRequest): SupplyMatch {
  const supplierName = supplier.cascadeName;
  const requestedName = request.cascadingName;
  if (requestedName === undefined && (supplierName === undefined || supplierName === null)) {
    const requestedType = request.cascadingType;
    if (requestedType === undefined) return "yes";
    const token = requestedType as unknown as new () => unknown;
    const suppliedType = supplier.cascadeType;
    if (suppliedType !== undefined) {
      // Blazor: requestedType.IsAssignableFrom(typeof(TValue)).
      return suppliedType === requestedType || (suppliedType as unknown as { prototype: unknown }).prototype instanceof token ? "yes" : "no";
    }
    const value = supplier.cascadeValue;
    if (value === null || value === undefined) return "pending";
    return value instanceof token || (value as object).constructor === token ? "yes" : "no";
  }
  if (requestedName === undefined || supplierName === undefined || supplierName === null) return "no";
  return requestedName.toLowerCase() === supplierName.toLowerCase() ? "yes" : "no";
}
