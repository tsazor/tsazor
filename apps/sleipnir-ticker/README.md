# Sleipnir Ticker — live Bitcoin viewer

The first real app that wires **Tsazor** to **Sleipnir**: an ASP.NET Core API
(NuGet `Sleipnir.Server`) relays Binance WebSocket ticker data as a command API with
server-push events; the Tsazor frontend renders it live — no polling, the updates arrive in
the components as SSE events.

## Running

```bash
pnpm --filter sleipnir-ticker api     # API on :5310 (TICKER_MODE see below)
pnpm --filter sleipnir-ticker dev     # app on :5311 (SSE/REST via Vite proxy)
```

The data path never ends silently: the server connects to the Binance feed
`wss://stream.binance.com:9443/ws/btcusdt@ticker` via `ClientWebSocket` (reconnect with
backoff, proactive reconnect before Binance's 24 h close). If Binance is unreachable,
`TICKER_MODE=auto` (the default) falls back to a synthetic feed (random walk) after 10 s — the
mode is shown in `TickerFeedStatus` and in the UI's connection badge.

```bash
TICKER_MODE=auto|binance|synthetic
```

Verify (synthetic, deterministic): `pnpm --filter sleipnir-ticker verify`

## The generated client (type safety from the contract)

The TS client is generated from the API's runtime discovery — no hand-written wrappers; the C#
contracts (records in `api/Controllers`/`api/Models`) are the source of all types:

```bash
pnpm --filter sleipnir-ticker codegen   # starts the API itself if needed, generates into src/api/
```

- `src/api/` contains the generated result (`sleipnir-gen --lang ts
  --transport rest`) and is **committed** — verify does not need a running API.
- Check for contract drift: `npx sleipnir-gen … --selfcheck` (exit code 4 on drift).
- Usage: `client.market.getTicker()` → `TypedResponse<TickerSnapshot>`
  (narrowed `data`), events via `client.market.tickerUpdated(handlers)` →
  `Promise<SleipnirSubscription>`.

## Structure

| Part | Contents |
|---|---|
| `api/` | ASP.NET Core (net9.0): `MarketController` ([SleipnirMethod] GetTicker/GetHistory/GetStatus + [SleipnirEvent] TickerUpdated via `IObservable<TickerSnapshot>`), `TickerFeed` singleton, `BinanceTickerSource`/`SyntheticTickerSource` behind `ITickerSource` |
| `src/TickerStore.ts` | App-wide store: 1 SSE subscription for the app's lifetime; pages `this.observe(this.Store)` in `onInitialized` (re-render per change, unsubscribed on dispose) |
| `src/Pages/` | `/` live dashboard (price, 24h stats, sparkline, event log) · `/history` ring-buffer table |
| `src/components/` | `Sparkline.tsazor` (+`.tsazor.css` — scoped CSS isolation) · `EventLog.tsazor` |
| `scripts/` | `verify.mjs` (E2E, 15 checks, self-starting) · `codegen.mjs` |
| `test/` | `node --test` over the pure helpers (`src/formatters.mjs`) |

## Ports

API :5310 · Vite :5311 (`strictPort`, proxy: `/api/sleipnir`, `/sleipnirws`).
Blazing Pizza uses :5300/:5301, the demo :5199.

## Known limitations (v1)

- **No resume across reload**: the generated client surface does not expose
  `router.resume(subscriptionId, lastEventId)` → a reload subscribes again.
  On the server side `Resumable = true` stays (free in-process replay).
- Sidecar `TICKER_MODE=auto` only tries Binance within a 10 s budget — after that the feed is
  synthetic for the rest of this API process's lifetime (restart to try again).
