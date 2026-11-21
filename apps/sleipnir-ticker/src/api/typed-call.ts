// Auto-generated typed-call + batch machinery. Do not edit by hand.
//
// Each TypedCall carries its own path-type record as a type parameter (TPaths),
// set at the call site by the generated controller method. `exposes` takes
// `path: keyof TPaths` and the alias type is `TPaths[path]` — so path and alias
// validity are compile-checked without a (structurally ambiguous) lookup over T.
import { SleipnirCall, ExecutionMode } from "sleipnir-client";
import type { SleipnirRequest, SleipnirMultiRequest, SleipnirResponse } from "sleipnir-client";
import type { AnalysisJob, AnalysisRequest, AnalysisResult, JobProgress, PricePoint, TickerFeedStatus, TickerHistory, TickerSnapshot } from "./types.js";

export interface AnalysisJobPaths {
  "$": AnalysisJob;
  "$.id": number;
  "$.label": string;
  "$.points": number;
  "$.startedUtc": string;
  "$.state": string;
}

export interface AnalysisJobArrayPaths {
  "$": AnalysisJob[];
  "$[0]": AnalysisJob;
  "$[0].id": number;
  "$[0].label": string;
  "$[0].points": number;
  "$[0].startedUtc": string;
  "$[0].state": string;
  "$[*].id": number[];
  "$[*].label": string[];
  "$[*].points": number[];
  "$[*].startedUtc": string[];
  "$[*].state": string[];
}

export interface AnalysisRequestPaths {
  "$": AnalysisRequest;
  "$.label": string;
  "$.points": number;
}

export interface AnalysisRequestArrayPaths {
  "$": AnalysisRequest[];
  "$[0]": AnalysisRequest;
  "$[0].label": string;
  "$[0].points": number;
  "$[*].label": string[];
  "$[*].points": number[];
}

export interface AnalysisResultPaths {
  "$": AnalysisResult;
  "$.average": number;
  "$.changePercent": number;
  "$.max": number;
  "$.min": number;
}

export interface AnalysisResultArrayPaths {
  "$": AnalysisResult[];
  "$[0]": AnalysisResult;
  "$[0].average": number;
  "$[0].changePercent": number;
  "$[0].max": number;
  "$[0].min": number;
  "$[*].average": number[];
  "$[*].changePercent": number[];
  "$[*].max": number[];
  "$[*].min": number[];
}

export interface JobProgressPaths {
  "$": JobProgress;
  "$.jobId": number;
  "$.message": string;
  "$.percent": number;
  "$.result": AnalysisResult | null;
  "$.result.average": number;
  "$.result.changePercent": number;
  "$.result.max": number;
  "$.result.min": number;
  "$.seq": number;
  "$.state": string;
}

export interface JobProgressArrayPaths {
  "$": JobProgress[];
  "$[0]": JobProgress;
  "$[0].jobId": number;
  "$[0].message": string;
  "$[0].percent": number;
  "$[0].result": AnalysisResult | null;
  "$[0].result.average": number;
  "$[0].result.changePercent": number;
  "$[0].result.max": number;
  "$[0].result.min": number;
  "$[0].seq": number;
  "$[0].state": string;
  "$[*].jobId": number[];
  "$[*].message": string[];
  "$[*].percent": number[];
  "$[*].result": AnalysisResult | null[];
  "$[*].result.average": number[];
  "$[*].result.changePercent": number[];
  "$[*].result.max": number[];
  "$[*].result.min": number[];
  "$[*].seq": number[];
  "$[*].state": string[];
}

export interface PricePointPaths {
  "$": PricePoint;
  "$.price": number;
  "$.t": number;
}

export interface PricePointArrayPaths {
  "$": PricePoint[];
  "$[0]": PricePoint;
  "$[0].price": number;
  "$[0].t": number;
  "$[*].price": number[];
  "$[*].t": number[];
}

export interface TickerFeedStatusPaths {
  "$": TickerFeedStatus;
  "$.connectedSinceUtc": string | null;
  "$.detail": string | null;
  "$.mode": string;
  "$.reconnects": number;
  "$.state": string;
}

export interface TickerFeedStatusArrayPaths {
  "$": TickerFeedStatus[];
  "$[0]": TickerFeedStatus;
  "$[0].connectedSinceUtc": string | null;
  "$[0].detail": string | null;
  "$[0].mode": string;
  "$[0].reconnects": number;
  "$[0].state": string;
  "$[*].connectedSinceUtc": string | null[];
  "$[*].detail": string | null[];
  "$[*].mode": string[];
  "$[*].reconnects": number[];
  "$[*].state": string[];
}

export interface TickerHistoryPaths {
  "$": TickerHistory;
  "$.points": PricePoint[];
  "$.points[0]": PricePoint;
  "$.points[*]": PricePoint[];
  "$.points[0].price": number;
  "$.points[0].t": number;
  "$.points[*].price": number[];
  "$.points[*].t": number[];
  "$.symbol": string;
}

export interface TickerHistoryArrayPaths {
  "$": TickerHistory[];
  "$[0]": TickerHistory;
  "$[0].points": PricePoint[];
  "$[0].points[0]": PricePoint;
  "$[0].points[*]": PricePoint[];
  "$[0].points[0].price": number;
  "$[0].points[0].t": number;
  "$[0].points[*].price": number[];
  "$[0].points[*].t": number[];
  "$[0].symbol": string;
  "$[*].points": PricePoint[][];
  "$[*].points[0]": PricePoint[];
  "$[*].points[*]": PricePoint[];
  "$[*].points[0].price": number[];
  "$[*].points[0].t": number[];
  "$[*].points[*].price": number[];
  "$[*].points[*].t": number[];
  "$[*].symbol": string[];
}

export interface TickerSnapshotPaths {
  "$": TickerSnapshot;
  "$.eventTimeMs": number;
  "$.high": number;
  "$.lastPrice": number;
  "$.low": number;
  "$.mode": string;
  "$.priceChange": number;
  "$.priceChangePercent": number;
  "$.quoteVolume": number;
  "$.serverTimeUtc": string;
  "$.symbol": string;
  "$.volume": number;
}

export interface TickerSnapshotArrayPaths {
  "$": TickerSnapshot[];
  "$[0]": TickerSnapshot;
  "$[0].eventTimeMs": number;
  "$[0].high": number;
  "$[0].lastPrice": number;
  "$[0].low": number;
  "$[0].mode": string;
  "$[0].priceChange": number;
  "$[0].priceChangePercent": number;
  "$[0].quoteVolume": number;
  "$[0].serverTimeUtc": string;
  "$[0].symbol": string;
  "$[0].volume": number;
  "$[*].eventTimeMs": number[];
  "$[*].high": number[];
  "$[*].lastPrice": number[];
  "$[*].low": number[];
  "$[*].mode": string[];
  "$[*].priceChange": number[];
  "$[*].priceChangePercent": number[];
  "$[*].quoteVolume": number[];
  "$[*].serverTimeUtc": string[];
  "$[*].symbol": string[];
  "$[*].volume": number[];
}

export interface _NumberPaths {
  "$": number;
}

export interface _NumberArrayPaths {
  "$": number[];
  "$[0]": number;
  "$[*]": number[];
}

export interface _StringPaths {
  "$": string;
}

export interface _StringArrayPaths {
  "$": string[];
  "$[0]": string;
  "$[*]": string[];
}

export interface _BooleanPaths {
  "$": boolean;
}

export interface _BooleanArrayPaths {
  "$": boolean[];
  "$[0]": boolean;
  "$[*]": boolean[];
}

export interface _BigintPaths {
  "$": bigint;
}

export interface _BigintArrayPaths {
  "$": bigint[];
  "$[0]": bigint;
  "$[*]": bigint[];
}

export interface _UnknownPaths {
  "$": unknown;
}

export interface _UnknownArrayPaths {
  "$": unknown[];
  "$[0]": unknown;
  "$[*]": unknown[];
}

export interface _VoidPaths {}

/** A map of valid result-relative $-paths to their extracted type, for a call. */
export type PathTypes = Record<string, unknown>;

/**
 * A typed single call wrapping a sleipnir-client {@link SleipnirCall}. `TPaths` is
 * the generated path-type record for this call's return type.
 */
export class TypedCall<T, TPaths = PathTypes> {
  constructor(public readonly _call: SleipnirCall) {}
  /** Set the request id (correlation). */
  named(id: string): this { this._call.named(id); return this; }
  /** Materialize the wire request. */
  toRequest(): SleipnirRequest { return this._call.toRequest(); }
}

/**
 * A call enrolled in a batch. `exposes` declares an alias the server will
 * resolve from this call's result; the alias type (`TPaths[path]`) is tracked
 * at compile time so `alias("@x")` returns the producer's exposed type.
 */
export class TypedRequest<T, TPaths = PathTypes, A extends Record<string, unknown> = {}> {
  /** @internal */ _call: SleipnirCall;
  constructor(call: TypedCall<T, TPaths>) { this._call = call._call; }
  /**
   * Declare that this call exposes `path` as `alias`. Compile-time-checked.
   * The wire `dependencyMapping` key is the alias **without** the leading `@`
   * (the server strips `@` from a consumer's `@alias` placeholder before
   * lookup — see SleipnirInvoker.ReplaceDependencyByAliasCore), so we strip it
   * here. The alias type (`TPaths[path]`) is tracked regardless.
   */
  exposes<P extends string & keyof TPaths, Aname extends string>(path: P, alias: Aname): TypedRequest<T, TPaths, A & Record<Aname, TPaths[P]>> {
    this._call.exposes(path, alias.startsWith("@") ? alias.slice(1) : alias);
    return this as TypedRequest<T, TPaths, A & Record<Aname, TPaths[P]>>;
  }
  /** Set the request id. */
  named(id: string): this { this._call.named(id); return this; }
  /**
   * Resolve a previously-declared alias to its typed value (for a consumer param).
   * At runtime this returns the literal `@alias` placeholder string — the wire
   * value the server substitutes in Serial/topological mode (mirrors
   * `SleipnirCall.withAlias("@x")`, which sets `data: "@x"`). The compile-time type
   * is the producer's exposed type, so the consumer param typechecks.
   *
   * `@`-normalization is symmetric with `exposes`: `exposes` STRIPS a leading `@`
   * (the wire `dependencyMapping` key is the bare name — the server strips the
   * consumer's `@alias` placeholder before lookup), while `alias` ENSURES a leading
   * `@` (the consumer sends `data: "@alias"`). So both call styles work:
   * `alias("ids")` → `"@ids"` and `alias("@ids")` → `"@ids"`. Returning the bare
   * name here (the 1.2.1 bug) sent `"ids"` on the wire, which the server's
   * `ReplaceDependencyByAlias` never matched — the typed chain compiled but the
   * dependent call received an unresolved literal instead of the alias value.
   */
  alias<Aname extends string & keyof A>(name: Aname): A[Aname] {
    return (name.startsWith("@") ? name : "@" + name) as unknown as A[Aname];
  }
  /** @internal */ toRequest(): SleipnirRequest { return this._call.toRequest(); }
}

/**
 * Batch builder for dependency-chained calls. Execution mode is Serial (the
 * only mode that resolves `@alias` placeholders). Add calls in topological
 * order: a producer's `exposes` must run before any consumer's `alias`.
 */
export class Batch<A extends Record<string, unknown> = {}> {
  private _requests: TypedRequest<unknown, PathTypes, Record<string, unknown>>[] = [];
  add<T, TPaths = PathTypes>(call: TypedCall<T, TPaths>): TypedRequest<T, TPaths, A> {
    const r = new TypedRequest<T, TPaths, A>(call);
    this._requests.push(r as unknown as TypedRequest<unknown, PathTypes, Record<string, unknown>>);
    return r;
  }
  /** Build the wire multi-request (Serial). */
  toMulti(): SleipnirMultiRequest {
    return SleipnirCall.batch(this._requests.map((r) => r.toRequest()), ExecutionMode.Serial);
  }
}
