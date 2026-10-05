import type { AuthorizationRequirements } from "../auth/authorization.js";
import type { LayoutComponentBase } from "./layout-component-base.js";

/**
 * Routing data model, mirroring Blazor's RouteData / RouteTable / RouteEntry /
 * TemplateParser / RouteConstraint: `"/user/{Id:int}"` (typed constraints),
 * `"/o/{id:int?}"` (optional), `"{*Path}"` / `"{**Path}"` (catch-all).
 */

/** A route entry from the app's route manifest (one per @page template). */
export interface RouteEntry {
  /** The template from the component's @page directive. */
  readonly template: string;
  /** The @page component class. */
  readonly type: abstract new (...args: never[]) => unknown;
  /** Optional per-page layout from the component's @layout directive. */
  readonly layout?: abstract new (...args: never[]) => LayoutComponentBase;
  /** Authorization requirements (Blazor's [Authorize] on the page); consumed by AuthorizeRouteView. */
  readonly authorize?: AuthorizationRequirements;
}

/** What a lazy route entry loads: the page and its layout. */
export interface LoadedRoute {
  /** The @page component class. */
  readonly type: abstract new (...args: never[]) => unknown;
  /** The page's @layout, loaded with it. */
  readonly layout?: abstract new (...args: never[]) => LayoutComponentBase;
}

/**
 * A route whose page is loaded on the first navigation to it (Tsazor
 * extension, E5 — Blazor lazy-loads assemblies in OnNavigateAsync instead).
 * The template and the authorization requirements are known up front, so
 * matching and AuthorizeRouteView decide before anything is loaded. The Vite
 * plugin generates these for the pages its `lazyRoutes` option matches.
 */
export interface LazyRouteEntry {
  /** The template from the component's @page directive. */
  readonly template: string;
  /** Loads the page (and its layout), once. A page with several templates shares one function. */
  readonly load: () => Promise<LoadedRoute>;
  /** Authorization requirements, as on RouteEntry. */
  readonly authorize?: AuthorizationRequirements;
}

/** An entry of the route manifest: eager or lazy. */
export type RouteManifestEntry = RouteEntry | LazyRouteEntry;

/** Whether an entry is lazy (has `load` instead of `type`). */
export function isLazyRoute(route: RouteManifestEntry): route is LazyRouteEntry {
  return "load" in route && !("type" in route);
}

/** A route table match: the manifest entry (eager or lazy) and the typed values. */
export interface RouteMatch {
  /** The matched manifest entry. */
  readonly route: RouteManifestEntry;
  /** URL parameter values, typed per constraint (strings otherwise). */
  readonly values: Record<string, RouteValue>;
}

/**
 * A route parameter value, typed per constraint: `int`/`double`/`float`/
 * `decimal` ⇒ number, `long` ⇒ bigint (no precision loss above 2^53),
 * `bool` ⇒ boolean, `datetime` ⇒ Date, everything else ⇒ string. `null` for
 * an omitted optional parameter / empty catch-all, and for parameters of the
 * page's other @page templates (Blazor's UnusedRouteParameterNames).
 */
export type RouteValue = string | number | bigint | boolean | Date | null;

/** Result of matching a URL against a route template. */
export interface RouteData {
  /** The matched route entry. */
  readonly route: RouteEntry;
  /** URL parameter values, typed per constraint (strings otherwise). */
  readonly values: Record<string, RouteValue>;
}

/**
 * DI token for the app's route manifest. Registered by createTsazorApp from
 * the `routes` option (Blazor's AppAssembly reflection analogue).
 */
export class RouteManifest {
  /** Wraps the app's route entries for registration in DI. */
  constructor(
    /** The routes, in manifest order (the Router sorts them by precedence). */
    readonly entries: RouteManifestEntry[],
  ) {}
}

/** Sentinel for "constraint did not match" (a match may legitimately convert to a falsy value). */
const NO_MATCH: unique symbol = Symbol("no-match");

/** Blazor's RouteConstraint: validates a segment and converts it to the typed value. */
interface RouteConstraint {
  /** Constraint text as written in the template (`int`, `regex(a|b)`), for ambiguity checks. */
  readonly text: string;
  /** Typed constraints convert (int ⇒ number); string-valued ones (alpha, regex) do not. */
  readonly converts: boolean;
  match(raw: string): RouteValue | typeof NO_MATCH;
}

interface TemplateSegment {
  readonly isParameter: boolean;
  /** Literal text or parameter name. */
  readonly value: string;
  readonly constraints: readonly RouteConstraint[];
  readonly isOptional: boolean;
  readonly isCatchAll: boolean;
}

interface ParsedRoute {
  template: string;
  segments: TemplateSegment[];
}

const parseCache = new Map<string, ParsedRoute>();

/* Constraints -------------------------------------------------------------- */

// Every pattern below is used anchored and grouped (`^(?:…)$`), so an
// alternation can never match a prefix/suffix only ("trueish" vs bool).
const INTEGER = /^[+-]?\d+$/;
// NumberStyles.Float | AllowThousands (ASP.NET's double/float constraints).
const FLOAT = /^[+-]?(?=\.?\d)(?:\d[\d,]*)?(?:\.\d*)?(?:e[+-]?\d+)?$/i;
// NumberStyles.Number (decimal constraint): no exponent.
const DECIMAL = /^[+-]?(?=\.?\d)(?:\d[\d,]*)?(?:\.\d*)?$/;
const GUID_D = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUID_N = /^[0-9a-f]{32}$/i;
const DATETIME = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(\.\d{1,7})?)?)?(Z|[+-]\d{2}:\d{2})?$/i;

const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;
const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;
const DECIMAL_MAX = 79228162514264337593543950335;

function typed(text: string, match: (raw: string) => RouteValue | typeof NO_MATCH): RouteConstraint {
  return { text, converts: true, match };
}

function pattern(text: string, regex: RegExp): RouteConstraint {
  return { text, converts: false, match: (raw) => (regex.test(raw) ? raw : NO_MATCH) };
}

/** Constraint name (case-insensitive) → factory. */
const CONSTRAINT_FACTORIES: Record<string, (text: string) => RouteConstraint> = {
  int: (text) =>
    typed(text, (raw) => {
      if (!INTEGER.test(raw)) return NO_MATCH;
      const value = Number(raw);
      return value >= INT_MIN && value <= INT_MAX ? value : NO_MATCH;
    }),
  // bigint: a C# long exceeds Number.MAX_SAFE_INTEGER; range-checked like long.TryParse.
  long: (text) =>
    typed(text, (raw) => {
      if (!INTEGER.test(raw)) return NO_MATCH;
      const value = BigInt(raw);
      return value >= LONG_MIN && value <= LONG_MAX ? value : NO_MATCH;
    }),
  bool: (text) =>
    typed(text, (raw) => {
      const lower = raw.toLowerCase();
      return lower === "true" ? true : lower === "false" ? false : NO_MATCH;
    }),
  double: (text) => typed(text, (raw) => (FLOAT.test(raw) ? Number(raw.replace(/,/g, "")) : NO_MATCH)),
  float: (text) => typed(text, (raw) => (FLOAT.test(raw) ? Math.fround(Number(raw.replace(/,/g, ""))) : NO_MATCH)),
  // JS has no decimal type: the value is a number (precision of a double).
  decimal: (text) =>
    typed(text, (raw) => {
      if (!DECIMAL.test(raw)) return NO_MATCH;
      const value = Number(raw.replace(/,/g, ""));
      return Math.abs(value) <= DECIMAL_MAX ? value : NO_MATCH;
    }),
  datetime: (text) => typed(text, parseDateTime),
  // The value stays the URL text (JS has no Guid type); D, N, B and P formats as Guid.TryParse.
  guid: (text) =>
    typed(text, (raw) => {
      const inner = /^\{.*\}$|^\(.*\)$/.test(raw) ? raw.slice(1, -1) : raw;
      return GUID_D.test(inner) || (inner === raw && GUID_N.test(raw)) ? raw : NO_MATCH;
    }),
  alpha: (text) => pattern(text, /^(?:[a-z]*)$/i),
  alphaNumeric: (text) => pattern(text, /^(?:[a-z0-9]*)$/i),
};

const CONSTRAINT_NAMES = new Map(Object.keys(CONSTRAINT_FACTORIES).map((name) => [name.toLowerCase(), name]));

/**
 * Converts one raw value with a constraint's converter (the SupplyParameterFromQuery
 * `type` option; `{id:int}` routes use the same machinery). Returns null when
 * the raw value does not convert; throws for an unknown constraint name —
 * like an invalid template.
 */
export function convertRouteRawValue(raw: string, constraint: string): RouteValue | null {
  const name = CONSTRAINT_NAMES.get(constraint.toLowerCase());
  if (!name) {
    throw new Error(
      `Unsupported constraint '${constraint}' (use one of: int, long, bool, double, float, decimal, datetime, guid, alpha, alphaNumeric).`,
    );
  }
  const value = CONSTRAINT_FACTORIES[name]!(constraint).match(raw);
  return value === NO_MATCH ? null : value;
}

/**
 * ISO 8601 date / date-time (DateTime.TryParse with InvariantCulture, the
 * subset a URL segment can carry). Without an offset the value is local time,
 * like an unspecified-kind DateTime.
 */
function parseDateTime(raw: string): Date | typeof NO_MATCH {
  const m = DATETIME.exec(raw);
  if (!m) return NO_MATCH;
  const [, y, mo, d, h = "0", mi = "0", s = "0", fraction, offset] = m;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  const ms = fraction ? Math.floor(Number(`0${fraction}`) * 1000) : 0;
  if (month > 11 || day < 1 || hour > 23 || minute > 59 || second > 59) return NO_MATCH;
  const local = new Date(year, month, day, hour, minute, second, ms);
  // Reject overflowing dates (2024-02-30).
  if (local.getFullYear() !== year || local.getMonth() !== month || local.getDate() !== day) return NO_MATCH;
  if (!offset) return local;
  const utc = Date.UTC(year, month, day, hour, minute, second, ms);
  if (offset.toUpperCase() === "Z") return new Date(utc);
  const sign = offset.startsWith("-") ? -1 : 1;
  const offsetMinutes = Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6));
  return new Date(utc - sign * offsetMinutes * 60_000);
}

/** Blazor's RouteConstraint.Parse: unknown constraints are template errors. */
function createConstraint(template: string, segment: string, text: string): RouteConstraint {
  if (text.startsWith("regex(") && text.endsWith(")")) {
    // Anchored and grouped: `regex(a|b)` matches exactly "a" or "b". (ASP.NET
    // leaves anchoring to the pattern; patterns with ^…$ behave the same.)
    const regex = new RegExp(`^(?:${text.slice(6, -1)})$`, "i");
    return pattern(text, regex);
  }
  const name = CONSTRAINT_NAMES.get(text.toLowerCase());
  if (!name) {
    throw new Error(`Unsupported constraint '${text}' in route '${template}' (segment '${segment}').`);
  }
  return CONSTRAINT_FACTORIES[name]!(text);
}

/* Template parser ------------------------------------------------------------ */

const INVALID_PARAMETER_NAME = /[{}=.*?/:]/;

/**
 * Parses a route template (Blazor's TemplateParser, cached). Throws on
 * invalid templates with Blazor's messages: empty segments, unbalanced
 * braces, catch-all not last, required segments after optional ones,
 * duplicate parameter names, optional catch-all, unknown constraints.
 */
export function parseRouteTemplate(template: string): ParsedRoute {
  const cached = parseCache.get(template);
  if (cached) return cached;
  const trimmed = template.replace(/^\/+|\/+$/g, "");
  const segments: TemplateSegment[] = [];
  if (trimmed !== "") {
    for (const raw of trimmed.split("/")) {
      segments.push(parseSegment(template, raw));
    }
  }
  for (let i = 0; i < segments.length; i++) {
    const current = segments[i]!;
    if (current.isCatchAll && i !== segments.length - 1) {
      throw new Error(`Invalid template '${template}'. A catch-all parameter can only appear as the last segment of the route template.`);
    }
    if (!current.isParameter) continue;
    for (let j = i + 1; j < segments.length; j++) {
      const next = segments[j]!;
      if (current.isOptional && !next.isOptional && !next.isCatchAll) {
        throw new Error(`Invalid template '${template}'. Non-optional parameters or literal routes cannot appear after optional parameters.`);
      }
      if (next.isParameter && next.value.toLowerCase() === current.value.toLowerCase()) {
        throw new Error(`Invalid template '${template}'. The parameter '${current.value}' appears multiple times.`);
      }
    }
  }
  const parsed: ParsedRoute = { template, segments };
  parseCache.set(template, parsed);
  return parsed;
}

function parseSegment(template: string, raw: string): TemplateSegment {
  if (raw === "") {
    throw new Error(`Invalid template '${template}'. Empty segments are not allowed.`);
  }
  if (!raw.startsWith("{")) {
    if (raw.endsWith("}")) {
      throw new Error(`Invalid template '${template}'. Missing '{' in parameter segment '${raw}'.`);
    }
    return { isParameter: false, value: raw, constraints: [], isOptional: false, isCatchAll: false };
  }
  if (!raw.endsWith("}")) {
    throw new Error(`Invalid template '${template}'. Missing '}' in parameter segment '${raw}'.`);
  }
  // `{{`/`}}` escape braces inside regex constraints (ASP.NET route syntax).
  let inner = raw.slice(1, -1).replace(/\{\{/g, "{").replace(/\}\}/g, "}");
  let isCatchAll = false;
  if (inner.startsWith("**")) {
    isCatchAll = true;
    inner = inner.slice(2);
  } else if (inner.startsWith("*")) {
    isCatchAll = true;
    inner = inner.slice(1);
  }
  const parts = splitConstraints(inner);
  let isOptional = false;
  const last = parts.length - 1;
  if (parts[last]!.endsWith("?")) {
    isOptional = true;
    parts[last] = parts[last]!.slice(0, -1);
  }
  const name = parts[0]!;
  if (name === "") {
    throw new Error(`Invalid template '${template}'. Empty parameter name in segment '${raw}' is not allowed.`);
  }
  const invalid = INVALID_PARAMETER_NAME.exec(name);
  if (invalid) {
    throw new Error(`Invalid template '${template}'. The character '${invalid[0]}' in parameter segment '${raw}' is not allowed.`);
  }
  if (isOptional && isCatchAll) {
    throw new Error(`Invalid segment '${raw}' in route '${template}' contains both an optional and a catch-all parameter.`);
  }
  const constraints = parts.slice(1).map((text) => createConstraint(template, raw, text));
  return { isParameter: true, value: name, constraints, isOptional, isCatchAll };
}

/** Splits `name:c1:regex(a:b)` at colons outside parentheses. */
function splitConstraints(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === "\\") {
      i++;
    } else if (c === "(") {
      depth++;
    } else if (c === ")") {
      depth = Math.max(0, depth - 1);
    } else if (c === ":" && depth === 0) {
      parts.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(inner.slice(start));
  return parts;
}

/* Route table ------------------------------------------------------------------ */

interface RouteTableEntry {
  readonly route: RouteManifestEntry;
  readonly template: ParsedRoute;
  /** Parameters of the page's other templates, reset to null on match. */
  readonly unusedParameterNames: readonly string[];
}

/**
 * Blazor's RouteTable: the manifest sorted by route precedence, so manifest
 * order does not matter. Segments are compared left to right by rank —
 * literal < constrained parameter < parameter < constrained catch-all <
 * catch-all — and on a tie the route with fewer segments comes first.
 * Routes that tie on every segment and would match the same URLs (same
 * literals, same constraints) are ambiguous: building the table throws.
 */
export class RouteTable {
  private constructor(
    /** The parsed routes in match order (highest precedence first). */
    readonly entries: readonly RouteTableEntry[],
  ) {}

  /**
   * Parses the route templates and sorts them by precedence (stable: equal
   * routes keep their order). Throws on an invalid template or when two
   * routes are ambiguous.
   */
  static create(routes: readonly RouteManifestEntry[]): RouteTable {
    const parametersByType = new Map<unknown, Map<string, string>>();
    const parsed = routes.map((route) => {
      const template = parseRouteTemplate(route.template);
      let names = parametersByType.get(pageKey(route));
      if (!names) parametersByType.set(pageKey(route), (names = new Map()));
      for (const segment of template.segments) {
        if (segment.isParameter && !names.has(segment.value.toLowerCase())) {
          names.set(segment.value.toLowerCase(), segment.value);
        }
      }
      return { route, template };
    });
    const entries: RouteTableEntry[] = parsed.map(({ route, template }) => {
      const own = new Set(template.segments.filter((s) => s.isParameter).map((s) => s.value.toLowerCase()));
      const unused = [...parametersByType.get(pageKey(route))!].filter(([key]) => !own.has(key)).map(([, name]) => name);
      return { route, template, unusedParameterNames: unused };
    });
    // Array.prototype.sort is stable: equal-precedence routes keep manifest order.
    entries.sort((x, y) => compareRoutes(x.template, y.template));
    detectAmbiguousRoutes(entries);
    return new RouteTable(entries);
  }

  /** Matches a base-relative path (like "/user/42"); query and hash are ignored. */
  match(path: string): RouteMatch | null {
    const segments = splitPath(path);
    for (const entry of this.entries) {
      const values = matchTemplate(entry, segments);
      if (values !== null) {
        return { route: entry.route, values };
      }
    }
    return null;
  }
}

/** Blazor's RouteTableFactory.GetRank. */
function rank(segment: TemplateSegment): number {
  if (!segment.isParameter) return 0;
  const constrained = segment.constraints.length > 0;
  if (!segment.isCatchAll) return constrained ? 1 : 2;
  return constrained ? 3 : 4;
}

/** Blazor's RouteTableFactory.RouteComparison (without the throw — see detectAmbiguousRoutes). */
function compareRoutes(x: ParsedRoute, y: ParsedRoute): number {
  const min = Math.min(x.segments.length, y.segments.length);
  for (let i = 0; i < min; i++) {
    const result = rank(x.segments[i]!) - rank(y.segments[i]!);
    if (result !== 0) return result;
  }
  return x.segments.length - y.segments.length;
}

/** Same precedence and the same URL space: literals equal (ignoring case), same parameter kinds and constraints. */
function equivalent(x: ParsedRoute, y: ParsedRoute): boolean {
  if (x.segments.length !== y.segments.length) return false;
  return x.segments.every((a, i) => {
    const b = y.segments[i]!;
    if (a.isParameter !== b.isParameter) return false;
    if (!a.isParameter) return a.value.toLowerCase() === b.value.toLowerCase();
    return (
      a.isOptional === b.isOptional &&
      a.isCatchAll === b.isCatchAll &&
      a.constraints.length === b.constraints.length &&
      a.constraints.every((c, j) => c.text.toLowerCase() === b.constraints[j]!.text.toLowerCase())
    );
  });
}

function detectAmbiguousRoutes(entries: readonly RouteTableEntry[]): void {
  // Equal-precedence routes are adjacent after the sort; compare within each run.
  let start = 0;
  for (let i = 1; i <= entries.length; i++) {
    if (i < entries.length && compareRoutes(entries[start]!.template, entries[i]!.template) === 0) continue;
    for (let a = start; a < i; a++) {
      for (let b = a + 1; b < i; b++) {
        const x = entries[a]!;
        const y = entries[b]!;
        if (equivalent(x.template, y.template)) {
          throw new Error(
            `The following routes are ambiguous:\n'${x.route.template}' in '${typeName(pageKey(x.route))}'\n'${y.route.template}' in '${typeName(pageKey(y.route))}'\n`,
          );
        }
      }
    }
    start = i;
  }
}

/** The page a route belongs to: its class, or its loader (shared by a lazy page's templates). */
function pageKey(route: RouteManifestEntry): unknown {
  return isLazyRoute(route) ? route.load : route.type;
}

function typeName(type: unknown): string {
  return (type as { name?: string }).name || "(anonymous)";
}

const tableCache = new WeakMap<readonly RouteManifestEntry[], RouteTable>();

/** The (cached) route table for a manifest array. Throws for ambiguous routes. */
export function getRouteTable(routes: readonly RouteManifestEntry[]): RouteTable {
  let table = tableCache.get(routes);
  if (!table) {
    table = RouteTable.create(routes);
    tableCache.set(routes, table);
  }
  return table;
}

/** Matches a base-relative path (like "/user/42") against the route manifest, by precedence. */
export function matchRoute(routes: readonly RouteManifestEntry[], path: string): RouteMatch | null {
  return getRouteTable(routes).match(path);
}

/**
 * Splits a path into non-empty segments (query and hash removed) and
 * URL-decodes each one except `%2F`, which stays encoded so it cannot fake a
 * segment boundary (Blazor's RouteContext since .NET 8).
 */
function splitPath(path: string): string[] {
  return path
    .split("?")[0]!
    .split("#")[0]!
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => s.split(/%2F/i).map(decodeSegmentPart).join("%2F"));
}

function decodeSegmentPart(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part; // malformed escape: keep the raw text
  }
}

/** Blazor's RouteEntry.Match: literals/parameters, optional tail, catch-all (constrained per segment). */
function matchTemplate(entry: RouteTableEntry, path: string[]): Record<string, RouteValue> | null {
  const segments = entry.template.segments;
  const values: Record<string, RouteValue> = {};
  let pathIndex = 0;
  let templateIndex = 0;
  while (pathIndex < path.length && templateIndex < segments.length) {
    const segment = segments[templateIndex]!;
    if (!segment.isParameter) {
      if (path[pathIndex]!.toLowerCase() !== segment.value.toLowerCase()) return null;
      pathIndex++;
      templateIndex++;
      continue;
    }
    if (segment.isCatchAll) {
      // The rest of the path, each segment checked against the constraints;
      // the value is the decoded segments joined with "/".
      const rest = path.slice(pathIndex);
      for (const value of rest) {
        if (matchConstraints(segment, value) === NO_MATCH) return null;
      }
      values[segment.value] = rest.join("/");
      pathIndex = path.length;
      templateIndex++;
      break;
    }
    const value = matchConstraints(segment, path[pathIndex]!);
    if (value === NO_MATCH) return null;
    values[segment.value] = value;
    pathIndex++;
    templateIndex++;
  }
  if (pathIndex < path.length) return null;
  // Remaining template segments must all be optional (or a trailing catch-all).
  for (let i = templateIndex; i < segments.length; i++) {
    const segment = segments[i]!;
    if (!segment.isOptional && !segment.isCatchAll) return null;
    values[segment.value] = null;
  }
  for (const name of entry.unusedParameterNames) {
    values[name] = null;
  }
  return values;
}

/** Runs all constraints; the first converting constraint determines the value (string otherwise). */
function matchConstraints(segment: TemplateSegment, raw: string): RouteValue | typeof NO_MATCH {
  let converted: RouteValue | undefined;
  for (const constraint of segment.constraints) {
    const result = constraint.match(raw);
    if (result === NO_MATCH) return NO_MATCH;
    if (constraint.converts && converted === undefined) converted = result;
  }
  return converted === undefined ? raw : converted;
}
