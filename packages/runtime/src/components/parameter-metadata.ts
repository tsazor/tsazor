/**
 * Parameter metadata, filled by the @Parameter / @CascadingParameter
 * decorators. Mirrors Blazor's [Parameter] / [CascadingParameter] attributes.
 */
export interface ParameterMeta {
  /** Property name the parameter is written to. */
  readonly propertyName: string;
  /** Cascading parameters: match by type token. */
  readonly cascading?: boolean;
  /** Cascading parameters: match by name instead of type. */
  readonly cascadingName?: string;
  /** Cascading parameters: type token for by-type matching. */
  readonly cascadingType?: abstract new (...args: never[]) => unknown;
  /** Captures attributes the parent passed that have no matching parameter. */
  readonly captureUnmatchedValues?: boolean;
}

const metadataRegistry = new WeakMap<abstract new () => unknown, Map<string, ParameterMeta>>();

/** Gets (creating if needed) the parameter metadata map for a component class. */
export function getParameterMetadata(
  type: abstract new () => unknown,
): Map<string, ParameterMeta> {
  let map = metadataRegistry.get(type);
  if (!map) {
    map = new Map<string, ParameterMeta>();
    metadataRegistry.set(type, map);
  }
  return map;
}

/** Looks up inherited parameter metadata (own class wins over base class). */
export function findParameterMetadata(
  type: abstract new () => unknown,
): Map<string, ParameterMeta> {
  const result = new Map<string, ParameterMeta>();
  const chain: Array<abstract new () => unknown> = [];
  let current: unknown = type;
  while (typeof current === "function" && current !== Object) {
    chain.unshift(current as abstract new () => unknown);
    const proto = Object.getPrototypeOf(current);
    current = proto;
  }
  for (const cls of chain) {
    const own = metadataRegistry.get(cls);
    if (own) {
      for (const [key, value] of own) {
        result.set(key, value);
      }
    }
  }
  return result;
}

/** [Parameter]-equivalent property decorator. */
export function Parameter(options?: { captureUnmatchedValues?: boolean }): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as abstract new () => unknown;
    const map = getParameterMetadata(ctor);
    map.set(String(propertyKey), {
      propertyName: String(propertyKey),
      captureUnmatchedValues: options?.captureUnmatchedValues,
    });
  };
}

/** [CascadingParameter]-equivalent property decorator. */
export function CascadingParameter(options?: {
  name?: string;
  /** Type token for by-type matching (TS has no property type metadata). */
  type?: abstract new (...args: never[]) => unknown;
}): PropertyDecorator {
  return (target: object, propertyKey: string | symbol) => {
    const ctor = target.constructor as abstract new () => unknown;
    const map = getParameterMetadata(ctor);
    map.set(String(propertyKey), {
      propertyName: String(propertyKey),
      cascading: true,
      cascadingName: options?.name,
      cascadingType: options?.type,
    });
  };
}