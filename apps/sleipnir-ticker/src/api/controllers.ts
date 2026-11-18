// Auto-generated Sleipnir controllers. Method names are camelCase; parameter
// names bind case-sensitively on the wire (keys passed verbatim to SleipnirCall).
import { SleipnirCall } from "sleipnir-client";
import type { SleipnirRequest, SubscribeHandlers, SleipnirSubscription, SleipnirSubscribeOptions } from "sleipnir-client";
import { TypedCall } from "./typed-call.js";
import type { AnalysisJob, AnalysisRequest, AnalysisResult, JobProgress, PricePoint, TickerFeedStatus, TickerHistory, TickerSnapshot } from "./types.js";
import type { AnalysisJobArrayPaths, AnalysisJobPaths, TickerFeedStatusPaths, TickerHistoryPaths, TickerSnapshotPaths } from "./typed-call.js";

export class JobsClient {
  /** @internal */ _build: (controller: string, method: string) => SleipnirCall;
  /** @internal */ _subscribe: <T>(req: SleipnirRequest, handlers: SubscribeHandlers<T>, options?: SleipnirSubscribeOptions) => Promise<SleipnirSubscription>;
  constructor(
    build: (controller: string, method: string) => SleipnirCall,
    subscribe: <T>(req: SleipnirRequest, handlers: SubscribeHandlers<T>, options?: SleipnirSubscribeOptions) => Promise<SleipnirSubscription>,
  ) {
    this._build = build;
    this._subscribe = subscribe;
  }
  list(): TypedCall<AnalysisJob[], AnalysisJobArrayPaths> {
    return new TypedCall<AnalysisJob[], AnalysisJobArrayPaths>(this._build("Jobs", "List"));
  }

  progress(jobId: number, handlers: SubscribeHandlers<JobProgress>, options?: SleipnirSubscribeOptions): Promise<SleipnirSubscription> {
    return this._subscribe<JobProgress>(this._build("Jobs", "Progress").with({ jobId: jobId }).toRequest(), handlers, options);
  }

  start(request: AnalysisRequest): TypedCall<AnalysisJob, AnalysisJobPaths> {
    return new TypedCall<AnalysisJob, AnalysisJobPaths>(this._build("Jobs", "Start").with({ request: request }));
  }
}

export class MarketClient {
  /** @internal */ _build: (controller: string, method: string) => SleipnirCall;
  /** @internal */ _subscribe: <T>(req: SleipnirRequest, handlers: SubscribeHandlers<T>, options?: SleipnirSubscribeOptions) => Promise<SleipnirSubscription>;
  constructor(
    build: (controller: string, method: string) => SleipnirCall,
    subscribe: <T>(req: SleipnirRequest, handlers: SubscribeHandlers<T>, options?: SleipnirSubscribeOptions) => Promise<SleipnirSubscription>,
  ) {
    this._build = build;
    this._subscribe = subscribe;
  }
  getHistory(count: number): TypedCall<TickerHistory, TickerHistoryPaths> {
    return new TypedCall<TickerHistory, TickerHistoryPaths>(this._build("Market", "GetHistory").with({ count: count }));
  }

  getStatus(): TypedCall<TickerFeedStatus, TickerFeedStatusPaths> {
    return new TypedCall<TickerFeedStatus, TickerFeedStatusPaths>(this._build("Market", "GetStatus"));
  }

  getTicker(): TypedCall<TickerSnapshot, TickerSnapshotPaths> {
    return new TypedCall<TickerSnapshot, TickerSnapshotPaths>(this._build("Market", "GetTicker"));
  }

  tickerUpdated(handlers: SubscribeHandlers<TickerSnapshot>, options?: SleipnirSubscribeOptions): Promise<SleipnirSubscription> {
    return this._subscribe<TickerSnapshot>(this._build("Market", "TickerUpdated").toRequest(), handlers, options);
  }
}
