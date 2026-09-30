import type { AuthorizationRequirements } from "../auth/authorization";
import type { RenderFragment } from "../render-tree/render-tree";
import type { LayoutComponentBase } from "./layout-component-base";

/**
 * Routing data model, mirroring Blazor's RouteData / route templates:
 * `"/user/{Id:int}"` (typed constraints), `"{*Path}"` (catch-all).
 */

/** A route entry from the app's route manifest (one per @page component). */
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

/** Result of matching a URL against a route template. */
export interface RouteData {
  /** The matched route entry. */
  readonly route: RouteEntry;
  /** URL parameter values, typed per constraint (strings otherwise). */
  readonly values: Record<string, string | number | boolean>;
}

/**
 * DI token for the app's route manifest. Registered by createTsazorApp from
 * the `routes` option (Blazor's AppAssembly reflection analogue).
 */
export class RouteManifest {
  constructor(readonly entries: RouteEntry[]) {}
}

type RouteSegment =
  | { kind: "literal"; value: string }
  | { kind: "parameter"; name: string; constraint?: string; catchAll: boolean };

interface ParsedRoute {
  template: string;
  segments: RouteSegment[];
}

const parseCache = new Map<string, ParsedRoute>();

/** Constraint name → matcher. Extra groups are the captured value. */
const CONSTRAINTS: Record<string, { pattern: string; coerce?: (raw: string) => string | number | boolean }> = {
  int: { pattern: "-?\\d+", coerce: (raw) => Number.parseInt(raw, 10) },
  long: { pattern: "-?\\d+", coerce: (raw) => Number.parseInt(raw, 10) },
  bool: { pattern: "true|false", coerce: (raw) => raw === "true" },
  guid: { pattern: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" },
  alpha: { pattern: "[A-Za-z]*" },
  alphaNumeric: { pattern: "[A-Za-z0-9]*" },
};

/** Parses a route template into literal/parameter segments (cached). */
export function parseRouteTemplate(template: string): ParsedRoute {
  const cached = parseCache.get(template);
  if (cached) return cached;
  const segments: RouteSegment[] = [];
  for (const raw of template.split("/").filter((s) => s.length > 0)) {
    if (raw.startsWith("{") && raw.endsWith("}")) {
      const inner = raw.slice(1, -1);
      if (inner.startsWith("*")) {
        const name = inner.slice(1).split(":")[0]!;
        segments.push({ kind: "parameter", name, catchAll: true });
      } else {
        const colon = inner.indexOf(":");
        const name = colon >= 0 ? inner.slice(0, colon) : inner;
        const constraint = colon >= 0 ? inner.slice(colon + 1) : undefined;
        segments.push({ kind: "parameter", name, constraint, catchAll: false });
      }
    } else {
      segments.push({ kind: "literal", value: raw });
    }
  }
  const parsed: ParsedRoute = { template, segments };
  parseCache.set(template, parsed);
  return parsed;
}

/** Normalizes a path into non-empty lowercase segments. */
function splitPath(path: string): string[] {
  return path.split("?")[0]!.split("#")[0]!.split("/").filter((s) => s.length > 0);
}

/** Matches a base-relative path (like "/user/42") against the route manifest. */
export function matchRoute(routes: RouteEntry[], path: string): RouteData | null {
  const pathSegments = splitPath(path).map((s) => decodeURIComponent(s));
  for (const route of routes) {
    const values = matchTemplate(parseRouteTemplate(route.template), pathSegments);
    if (values !== null) {
      return { route, values };
    }
  }
  return null;
}

function matchTemplate(parsed: ParsedRoute, pathSegments: string[]): Record<string, string | number | boolean> | null {
  const values: Record<string, string | number | boolean> = {};
  for (let i = 0; i < parsed.segments.length; i++) {
    const segment = parsed.segments[i]!;
    if (segment.kind === "literal") {
      const value = pathSegments[i]?.toLowerCase();
      if (value !== segment.value.toLowerCase()) return null;
      continue;
    }
    if (segment.catchAll) {
      const rest = pathSegments.slice(i);
      if (segment.constraint) {
        const matcher = compiledConstraint(segment.constraint);
        for (const value of rest) {
          if (!matcher.test(value)) return null;
        }
      }
      values[segment.name] = rest.map((s) => encodeURIComponent(s)).join("/");
      return values;
    }
    const value = pathSegments[i];
    if (value === undefined) return null;
    if (segment.constraint) {
      const matcher = compiledConstraint(segment.constraint);
      if (!matcher.test(value)) return null;
      const definition = CONSTRAINTS[segment.constraint];
      values[segment.name] = definition?.coerce ? definition.coerce(value) : value;
    } else {
      values[segment.name] = value;
    }
  }
  // The URL must not have extra segments (Blazor ignores trailing slashes only).
  if (pathSegments.length > parsed.segments.length) return null;
  return values;
}

const constraintCache = new Map<string, RegExp>();

function compiledConstraint(constraint: string): RegExp {
  const cached = constraintCache.get(constraint);
  if (cached) return cached;
  let pattern: string;
  if (constraint.startsWith("regex(") && constraint.endsWith(")")) {
    pattern = constraint.slice(6, -1);
  } else {
    pattern = CONSTRAINTS[constraint]?.pattern ?? ".*";
  }
  const matcher = new RegExp(`^${pattern}$`, "i");
  constraintCache.set(constraint, matcher);
  return matcher;
}