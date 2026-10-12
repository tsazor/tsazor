import type { QueryParameterMeta } from "../routing/supply-parameter-from-query.js";

/**
 * Parameter metadata, filled by the @Parameter / @CascadingParameter
 * decorators. Mirrors Blazor's [Parameter] / [CascadingParameter] attributes.
 *
 * Standard (TC39) decorators: each decorator records its member in the
 * class's decorator metadata (`context.metadata`, published by the language
 * as `Class[Symbol.metadata]`), under a private key, own entries per class.
 * Readers walk the class chain, so base-class parameters are included and a
 * derived re-declaration wins.
 */
export interface ParameterMeta {
  /** Property name the parameter is written to. */
  readonly propertyName: string;
  /** Cascading parameters: match by type token. */
  readonly cascading?: boolean;
  /** Cascading parameters: match by name instead of type. */
  readonly cascadingName?: string;
  /** Cascading parameters: type token for by-type matching. */
  readonly cascadingType?: CascadingTypeToken;
  /** Captures attributes the parent passed that have no matching parameter. */
  readonly captureUnmatchedValues?: boolean;
  /**
   * `@SupplyParameterFromQuery()`: the renderer supplies the value from the current URL's query
   * (Blazor 8's query value provider), for any component. Listed with the cascading parameters.
   */
  readonly query?: QueryParameterMeta;
  /**
   * @internal `@Bindable()`: the instance slot behind the accessor. The
   * runtime writes parameter values there directly, so setting parameters
   * never invokes the change callback (only local assignments do).
   */
  readonly store?: symbol;
}

// `Symbol.metadata` polyfill (TS 5.2+ decorator metadata; not every browser
// has it yet). tsc's decorator emit only creates `context.metadata` when
// `Symbol.metadata` exists at class-definition time, so it must be installed
// before any decorated class is evaluated. Every decorated class imports
// this module (for the decorators), and it imports nothing itself, so ESM
// evaluation order runs it first. `Symbol.for("Symbol.metadata")` is the
// symbol esbuild's decorator helpers fall back to — both emits agree.
const symbolWithMetadata = Symbol as unknown as { metadata?: symbol };
symbolWithMetadata.metadata ??= Symbol.for("Symbol.metadata");
const METADATA: symbol = symbolWithMetadata.metadata;

/** Key of the own parameter map inside a class's decorator metadata object. */
const PARAMETERS = Symbol("tsazor.parameters");

/**
 * Installs (once) and returns the `Symbol.metadata` symbol. Modules that add
 * their own decorator metadata (validation rules) import this instead of
 * duplicating the polyfill: every decorated class imports paramater-metadata
 * transitively, so the symbol exists before any decorated class is evaluated.
 */
export function ensureDecoratorMetadata(): symbol {
  const symbolWithMetadata = Symbol as unknown as { metadata?: symbol };
  return (symbolWithMetadata.metadata ??= Symbol.for("Symbol.metadata"));
}

type ComponentClass = abstract new () => unknown;
type MetadataObject = Record<PropertyKey, unknown>;

/** The members a parameter decorator may sit on (a plain field is the norm). */
type ParameterDecoratorContext = ClassFieldDecoratorContext | ClassAccessorDecoratorContext | ClassSetterDecoratorContext;

/**
 * Bumped by `defineParameter` (a registration after the class definition):
 * cached per-class lookups built before it are rebuilt instead of going
 * stale. Decorators need no bump — they run while the class is defined,
 * before anything can read its metadata.
 */
let registryVersion = 0;

/** The own parameter map in a decorator metadata object (created on first use). */
function ownParameterMap(metadata: MetadataObject): Map<string, ParameterMeta> {
  if (Object.hasOwn(metadata, PARAMETERS)) return metadata[PARAMETERS] as Map<string, ParameterMeta>;
  const map = new Map<string, ParameterMeta>();
  metadata[PARAMETERS] = map;
  return map;
}

/** The parameters a class declares itself (not inherited), or undefined. */
export function getOwnParameterMetadata(type: ComponentClass): ReadonlyMap<string, ParameterMeta> | undefined {
  if (!Object.hasOwn(type, METADATA)) return undefined;
  const metadata = (type as unknown as Record<symbol, MetadataObject | null | undefined>)[METADATA];
  return metadata != null && Object.hasOwn(metadata, PARAMETERS)
    ? (metadata[PARAMETERS] as ReadonlyMap<string, ParameterMeta>)
    : undefined;
}

/**
 * Declares a parameter without decorator syntax — for hand-written
 * components that add one after the class definition (tests, plain JS).
 * Equivalent to `@Parameter()` / `@CascadingParameter()` on the property:
 * the entry goes into the class's own decorator metadata.
 */
export function defineParameter(
  type: ComponentClass,
  propertyName: string,
  options: Omit<ParameterMeta, "propertyName"> = {},
): void {
  let metadata = Object.hasOwn(type, METADATA)
    ? (type as unknown as Record<symbol, MetadataObject | undefined>)[METADATA]
    : undefined;
  if (metadata == null) {
    // Same shape the decorator emit produces: inherits the base's metadata.
    const base = Object.getPrototypeOf(type) as Record<symbol, MetadataObject | undefined> | null;
    metadata = Object.create(base?.[METADATA] ?? null) as MetadataObject;
    Object.defineProperty(type, METADATA, { value: metadata, enumerable: true, configurable: true, writable: true });
  }
  ownParameterMap(metadata).set(propertyName, { propertyName, ...options });
  registryVersion++;
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

const infoCache = new WeakMap<ComponentClass, { version: number; info: ParameterInfo }>();

/** The cached ParameterInfo of a component class. */
export function getParameterInfo(type: ComponentClass): ParameterInfo {
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
export function findParameterMetadata(type: ComponentClass): Map<string, ParameterMeta> {
  return getParameterInfo(type).all as Map<string, ParameterMeta>;
}

function collectParameterMetadata(type: ComponentClass): Map<string, ParameterMeta> {
  const result = new Map<string, ParameterMeta>();
  const chain: ComponentClass[] = [];
  let current: unknown = type;
  while (typeof current === "function" && current !== Object && current !== Function.prototype) {
    chain.unshift(current as ComponentClass);
    current = Object.getPrototypeOf(current);
  }
  for (const cls of chain) {
    const own = getOwnParameterMetadata(cls);
    if (own) {
      for (const [key, value] of own) {
        result.set(key, value);
      }
    }
  }
  return result;
}

/**
 * @internal Records a decorated member in its class's decorator metadata;
 * `name` defaults to the decorated member (`@Bindable` adds its synthesized
 * callback parameters under their own names).
 */
export function register(context: ParameterDecoratorContext, decorator: string, meta: Omit<ParameterMeta, "propertyName">, name?: string): void {
  if (typeof context !== "object" || context === null) {
    // A legacy call `(prototype, "name")`: compiled with experimentalDecorators.
    throw new Error(`${decorator} is a standard (TC39) decorator — remove "experimentalDecorators" from the tsconfig (or call defineParameter() by hand).`);
  }
  if (context.static || context.private || typeof context.name !== "string") {
    throw new Error(`${decorator} applies to public instance members, not to '${String(context.name)}'.`);
  }
  if (context.metadata == null) {
    throw new Error(`${decorator}: decorator metadata is unavailable (Symbol.metadata was not installed before the class was defined).`);
  }
  const propertyName = name ?? context.name;
  const map = ownParameterMap(context.metadata);
  // `@Parameter() @SupplyParameterFromQuery() id`: decorators run inside out, so @Parameter()
  // registers second — it keeps the query supply.
  const query = meta.query ?? map.get(propertyName)?.query;
  map.set(propertyName, { propertyName, ...meta, ...(query !== undefined ? { query, cascading: true } : {}) });
}

/** [Parameter]-equivalent field decorator (`@Parameter() title = "";`). */
export function Parameter(options?: {
  captureUnmatchedValues?: boolean;
}): (value: unknown, context: ParameterDecoratorContext) => void {
  return (_value, context) => {
    register(context, "@Parameter()", { captureUnmatchedValues: options?.captureUnmatchedValues });
  };
}

/**
 * The class a cascading parameter matches by (`instanceof`, Blazor's parameter type): any class — abstract, or one
 * whose constructor is private, as SignalR's HubConnection, which a builder creates.
 */
export type CascadingTypeToken = { readonly prototype: object; readonly name: string };

/** [CascadingParameter]-equivalent field decorator. */
export function CascadingParameter(options?: {
  name?: string;
  /** Type token for by-type matching (TS has no property type metadata). */
  type?: CascadingTypeToken;
}): (value: unknown, context: ParameterDecoratorContext) => void {
  return (_value, context) => {
    register(context, "@CascadingParameter()", {
      cascading: true,
      cascadingName: options?.name,
      cascadingType: options?.type,
    });
  };
}
