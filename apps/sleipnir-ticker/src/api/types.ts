// Auto-generated Sleipnir data types. Properties are camelCase (wire) and
// presence-aware: non-nullable properties are required (always present on
// the wire); nullable properties are presence-optional (`?:`) because event
// frames omit null values (WhenWritingNull) — the value can still be null,
// so the `| null` remains.

export interface AnalysisJob {
  id: number;
  label: string;
  points: number;
  startedUtc: string;
  state: string;
}

export interface AnalysisRequest {
  label: string;
  points: number;
}

export interface AnalysisResult {
  average: number;
  changePercent: number;
  max: number;
  min: number;
}

export interface JobProgress {
  jobId: number;
  message: string;
  percent: number;
  result?: AnalysisResult | null;
  seq: number;
  state: string;
}

export interface PricePoint {
  price: number;
  t: number;
}

export interface TickerFeedStatus {
  connectedSinceUtc?: string | null;
  detail?: string | null;
  mode: string;
  reconnects: number;
  state: string;
}

export interface TickerHistory {
  points: PricePoint[];
  symbol: string;
}

export interface TickerSnapshot {
  eventTimeMs: number;
  high: number;
  lastPrice: number;
  low: number;
  mode: string;
  priceChange: number;
  priceChangePercent: number;
  quoteVolume: number;
  serverTimeUtc: string;
  symbol: string;
  volume: number;
}
