// Auto-generated Sleipnir data types. Properties are camelCase (wire) and
// optional (discovery carries no nullability; callers narrow).

export interface TickerSnapshot {
  symbol?: string;
  lastPrice?: number;
  priceChange?: number;
  priceChangePercent?: number;
  high?: number;
  low?: number;
  volume?: number;
  quoteVolume?: number;
  eventTimeMs?: number;
  serverTimeUtc?: string;
  mode?: string;
}

export interface TickerHistory {
  symbol?: string;
  points?: PricePoint[];
}

export interface PricePoint {
  t?: number;
  price?: number;
}

export interface TickerFeedStatus {
  mode?: string;
  state?: string;
  connectedSinceUtc?: string | null;
  reconnects?: number;
  detail?: string | null;
}
