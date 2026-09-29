// Auto-generated Sleipnir controllers. Method names are camelCase; parameter
// names bind case-sensitively on the wire (keys passed verbatim to SleipnirCall).
import { SleipnirCall } from "sleipnir-client";
import type { SleipnirRequest, SubscribeHandlers, SleipnirSubscription } from "sleipnir-client";
import { TypedCall } from "./typed-call.js";
import type { PricePoint, TickerFeedStatus, TickerHistory, TickerSnapshot } from "./types.js";
import type { TickerFeedStatusPaths, TickerHistoryPaths, TickerSnapshotPaths } from "./typed-call.js";

export class MarketClient {
  /** @internal */ _build: (controller: string, method: string) => SleipnirCall;
  /** @internal */ _subscribe: <T>(req: SleipnirRequest, handlers: SubscribeHandlers<T>) => Promise<SleipnirSubscription>;
  constructor(
    build: (controller: string, method: string) => SleipnirCall,
    subscribe: <T>(req: SleipnirRequest, handlers: SubscribeHandlers<T>) => Promise<SleipnirSubscription>,
  ) {
    this._build = build;
    this._subscribe = subscribe;
  }
  getTicker(): TypedCall<TickerSnapshot, TickerSnapshotPaths> {
    return new TypedCall<TickerSnapshot, TickerSnapshotPaths>(this._build("Market", "GetTicker"));
  }

  getHistory(count: number): TypedCall<TickerHistory, TickerHistoryPaths> {
    return new TypedCall<TickerHistory, TickerHistoryPaths>(this._build("Market", "GetHistory").with({ count: count }));
  }

  getStatus(): TypedCall<TickerFeedStatus, TickerFeedStatusPaths> {
    return new TypedCall<TickerFeedStatus, TickerFeedStatusPaths>(this._build("Market", "GetStatus"));
  }

  tickerUpdated(handlers: SubscribeHandlers<TickerSnapshot>): Promise<SleipnirSubscription> {
    return this._subscribe<TickerSnapshot>(this._build("Market", "TickerUpdated").toRequest(), handlers);
  }
}
