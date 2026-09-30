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

/**
 * Bumped by every decorator registration: cached per-class lookups built
 * before it (e.g. a decorator applied by hand after a first render) are
 * rebuilt instead of going stale.
 */
let registryVersion = 0;

/** Gets (creating if needed) the parameter metadata map for a component class. */
export function getParameterMetadata(
  type: abstract new () => unknown,
): Map<string, ParameterMeta> {
  registryVersion++;
  let map = metadataRegistry.get(type);
  if (!map) {
    map = new Map<string, ParameterMeta>();
    metadataRegistry.set(type, map);
  }
  return map;
}

/**
 * Everything setParameters needs about a component class, built once per
 * class (Blazor's per-type MemberAssignment/WritersForType cache) instead of
 * walking the prototype chain on every parameter set.
 */
export interface ParameterInfo {
  /** All parameters including inherited ones (own class wins). Shared: do not mutate. */
  readonly all: ReadonlyMap<string, ParameterMeta>;
  /** Lower-cased name → property name (Blazor matches case-insensitively). */
  readonly caseFolded: ReadonlyMap<string, string>;
  /** The captureUnmatchedValues property, or null. */
  readonly captureUnmatchedProperty: string | null;
  /** The cascading parameters (empty for most components). */
  readonly cascading: readonly ParameterMeta[];
}

const infoCache = new WeakMap<abstract new () => unknown, { version: number; info: ParameterInfo }>();

/** The cached ParameterInfo of a component class. */
export function getParameterInfo(type: abstract new () => unknown): ParameterInfo {
  const cached = infoCache.get(type);
  if (cached !== undefined && cached.version === registryVersion) return cached.info;
  const all = collectParameterMetadata(type);
  const caseFolded = new Map<string, string>();
  let captureUnmatchedProperty: string | null = null;
  const cascading: ParameterMeta[] = [];
  for (const [key, meta] of all) {
    caseFolded.set(key.toLowerCase(), key);
    if (meta.captureUnmatchedValues && captureUnmatchedProperty === null) captureUnmatchedProperty = key;
    if (meta.cascading) cascading.push(meta);
  }
  const info: ParameterInfo = { all, caseFolded, captureUnmatchedProperty, cascading };
  infoCache.set(type, { version: registryVersion, info });
  return info;
}

/** Looks up inherited parameter metadata (own class wins over base class); cached per class, do not mutate. */
export function findParameterMetadata(
  type: abstract new () => unknown,
): Map<string, ParameterMeta> {
  return getParameterInfo(type).all as Map<string, ParameterMeta>;
}

function collectParameterMetadata(
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