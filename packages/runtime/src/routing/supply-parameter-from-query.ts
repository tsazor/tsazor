/**
 * `SupplyParameterFromQuery` — Blazor's
 * SupplyParameterFromQueryAttribute + SupplyParameterFromQueryValueProvider
 * (roadmap 3.7): page parameters supplied from the current URL's query
 * string, refreshed on navigation.
 *
 * As in Blazor 8, it works on any component, not only on pages, and needs no
 * `@Parameter()`: the renderer supplies the value like a cascading value
 * (Blazor's SupplyParameterFromQueryValueProvider) and supplies it again when a
 * navigation changes it. A value the parent passes directly (a route value of
 * the same name) wins.
 * Query keys match case-insensitively (Blazor); a field declared with
 * `multiple: true` (Tsazor's substitute for an array type) converts one value
 * per repeated key, every other field takes the first value.
 *
 * TS has no property type metadata, so the value type is the decorator's
 * `type` option (the route-constraint names; invariant culture like all
 * routing data). Default "string".
 */
import { ensureDecoratorMetadata, register } from "../components/parameter-metadata.js";
import { convertRouteRawValue } from "./route-data.js";

const METADATA: symbol = ensureDecoratorMetadata();
const QUERY_PARAMETERS = Symbol("tsazor.queryParameters");

/** The value types a query parameter converts to (route-constraint names). */
export type QueryParameterType = "string" | "int" | "long" | "bool" | "double" | "float" | "decimal" | "datetime" | "guid";

/** A TC39 class-field decorator (the only form the decorator accepts). */
export type QueryParameterDecorator = (value: unknown, context: ClassFieldDecoratorContext) => void;

/** What `@SupplyParameterFromQuery()` records for one field: query key, value type and array-ness. */
export interface QueryParameterMeta {
  /** The query key; default: the field name (Blazor's Name). */
  readonly queryName?: string;
  /** The value type the strings convert to; default "string". */
  readonly queryType?: QueryParameterType;
  /** The field is an array: a repeated key supplies one converted value per element. */
  readonly multiple?: boolean;
}

/** [SupplyParameterFromQuery]-equivalent field decorator. */
export function SupplyParameterFromQuery(options?: { name?: string; type?: QueryParameterType; multiple?: boolean }): QueryParameterDecorator {
  return (_value, context) => {
    if (typeof context !== "object" || context === null || context.metadata == null) {
      throw new Error("@SupplyParameterFromQuery() is a standard (TC39) decorator — remove \"experimentalDecorators\" from the tsconfig.");
    }
    if (context.static || context.private || typeof context.name !== "string") {
      throw new Error(`@SupplyParameterFromQuery() applies to public instance fields, not to '${String(context.name)}'.`);
    }
    const metadata = context.metadata as Record<PropertyKey, unknown>;
    if (!Object.hasOwn(metadata, QUERY_PARAMETERS)) metadata[QUERY_PARAMETERS] = new Map<string, QueryParameterMeta>();
    const query: QueryParameterMeta = { queryName: options?.name, queryType: options?.type, multiple: options?.multiple };
    (metadata[QUERY_PARAMETERS] as Map<string, QueryParameterMeta>).set(context.name, query);
    // A parameter the renderer supplies (Blazor 8): no @Parameter() needed, any component.
    register(context as unknown as Parameters<typeof register>[0], "@SupplyParameterFromQuery()", { cascading: true, query });
  };
}

/** The query parameters of a page type, walking the class chain (a re-declared field wins). */
export function queryParametersOf(modelType: unknown): ReadonlyMap<string, QueryParameterMeta> {
  const result = new Map<string, QueryParameterMeta>();
  const chain: unknown[] = [];
  let current = modelType;
  while (typeof current === "function" && current !== Object && current !== Function.prototype) {
    chain.unshift(current);
    current = Object.getPrototypeOf(current);
  }
  for (const cls of chain) {
    if (!Object.hasOwn(cls as object, METADATA)) continue;
    const metadata = (cls as unknown as Record<symbol, Record<PropertyKey, unknown> | null | undefined>)[METADATA];
    if (metadata == null || !Object.hasOwn(metadata, QUERY_PARAMETERS)) continue;
    for (const [field, meta] of metadata[QUERY_PARAMETERS] as Map<string, QueryParameterMeta>) {
      result.set(field, meta);
    }
  }
  return result;
}

const QUERY_TYPES = ["string", "int", "long", "bool", "double", "float", "decimal", "datetime", "guid"];

/**
 * Blazor's QueryParameterValueSupplier: converts one query value to the
 * parameter's type via the route constraints' converters (route-data.ts);
 * null when it does not convert, Blazor's message for an unsupported type.
 */
export function convertQueryValue(raw: string, type: string): string | number | bigint | boolean | Date | null {
  if (!QUERY_TYPES.includes(type.toLowerCase())) {
    throw new Error(`Querystring values cannot be parsed as type '${type}'.`);
  }
  return convertRouteRawValue(raw, type);
}

/**
 * Blazor's GetQueryParameterValue (RouteView's supply pass): an array-typed
 * parameter (`multiple`) converts each of a repeated key's values, every
 * other parameter takes the FIRST value (Blazor: values[0]). An absent key is
 * null (`default(T)`; Tsazor's convention: declare the field nullable), a
 * failed conversion throws Blazor's Parse message text.
 */
export function queryParameterValue(raws: readonly string[], meta: QueryParameterMeta, name: string): unknown {
  if (raws.length === 0) return null;
  const type = meta.queryType ?? "string";
  const toValue = (raw: string): string | number | bigint | boolean | Date => {
    if (type === "string") return raw;
    const value = convertQueryValue(raw, type);
    if (value === null) throw new Error(`Cannot parse the value '${raw}' as type '${type}' for '${name}'.`);
    return value;
  };
  return meta.multiple === true ? raws.map(toValue) : toValue(raws[0]!);
}