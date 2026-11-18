# Sleipnir Ticker — live Bitcoin viewer

The reference integration of **Tsazor** with **Sleipnir** (NuGet `Sleipnir.Server` 1.8.1, npm
`sleipnir-client` / `sleipnir-codegen` 1.8.0): an ASP.NET Core API relays Binance ticker data as
a command API with server-push events; the Tsazor frontend renders it live — no polling, the
updates arrive in the components as SSE events. A second part shows what real apps need next:
per-entity event streams (one job's progress) and server validation errors in a form.

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

## The contract and the generated client

The C# records in `api/Controllers` / `api/Models` are the contract. The API project exports it
to the committed **`api/contract.sleipnir.json`**, and the TS client in `src/api/` is generated
from that file — codegen and CI never need a running API.

Two drift gates keep the three in step:

| Gate | Where | Fails when |
|---|---|---|
| Server | every `dotnet build api` (`Sleipnir.Server.Codegen`) | the C# contract differs from `contract.sleipnir.json` |
| Client | `pnpm --filter sleipnir-ticker codegen:check` (`sleipnir-gen --selfcheck`, exit 4) | `src/api/` differs from what `contract.sleipnir.json` generates |

After a contract change in C#:

```bash
pnpm --filter sleipnir-ticker codegen --contract   # SLEIPNIR_REGEN_GOLDEN=1 dotnet build api, then generate
# equivalent by hand:
SLEIPNIR_REGEN_GOLDEN=1 dotnet build apps/sleipnir-ticker/api   # PowerShell: $env:SLEIPNIR_REGEN_GOLDEN='1'
pnpm --filter sleipnir-ticker codegen                            # sleipnir-gen --discovery api/contract.sleipnir.json
```

Commit `contract.sleipnir.json` and `src/api/` together. `codegen --live` generates from the
running API's discovery instead — handy while exploring, not for the committed client.

- Generator call: `sleipnir-gen --lang ts --discovery api/contract.sleipnir.json --out src
  --transport rest` (REST calls + SSE events; the public surface is the same for every
  `--transport`).
- Usage: `client.call(client.market.getTicker())` → `TypedResponse<TickerSnapshot>` (narrowed
  `data`); events via `client.market.tickerUpdated(handlers, { signal })` →
  `Promise<SleipnirSubscription>` — aborting `signal` ends the subscription.
- The client sends the contract's hash (`SLEIPNIR_CONTRACT_HASH`) with every request; the
  server counts calls per client contract (`/api/sleipnir/observability` → `contracts`).
- **Restore note:** `Sleipnir.Server.Codegen` 1.8.x lists a dependency (`Sleipnir.Codegen.Core`)
  that is not on nuget.org, so a plain `PackageReference` fails with NU1101. The csproj downloads
  the package without dependencies (`PackageDownload`) and imports its build targets — the tool is
  self-contained. Switch back to a `PackageReference` once the dependency is published.

## Live data: one app-wide stream

`src/TickerStore.ts` holds the app's one SSE subscription (`Market.TickerUpdated`) for the
page's lifetime. Pages call `this.observe(this.Store)` in `onInitialized`: a re-render per
change, unsubscribed on dispose.

## Per-entity streams and server validation (`/jobs`)

An analysis job runs over the recorded price history in ten steps.

- **`Jobs.Start(request)`** returns `SleipnirResponse<AnalysisJob>`. The server validates against
  its own state (label unique among running jobs, no more points than recorded) and answers a
  failure with code 400, category `InvalidArgument`, and the field errors as JSON in
  `error.details`:

  ```json
  { "code": 400, "error": { "message": "The analysis request is invalid.", "category": "InvalidArgument",
    "details": "{\"label\":[\"The label is required.\"],\"points\":[\"Only 63 points are recorded so far.\"]}" } }
  ```

  Sleipnir has no field-error shape of its own yet; this convention (keys = the wire names of
  the parameter's properties) is the app's. `src/Pages/Jobs.tsazor` reads it (`fieldErrorsOf` in
  `src/jobs.mjs`) into a `ValidationMessageStore` of the form's `EditContext`, so each message
  shows in the field's `<ValidationMessage>`; a new submit clears the store, an edited field
  drops its own messages.
- **`Jobs.Progress(jobId)`** is an event per entity. Each job owns a `ReplaySubject`: every
  subscriber gets the job's history first, then the live steps, then the completion — a page
  opened late, mid-run or after the end shows the whole job. Events carry `seq` (1, 2, 3, …);
  `src/JobWatch.ts` drops a `seq` it has already applied. The page (`/jobs/{jobId}`) owns the
  watch: `observe()` re-renders per event, its `disposeSignal` ends the subscription.

## Structure

| Part | Contents |
|---|---|
| `api/` | ASP.NET Core (net10.0): `MarketController` ([SleipnirMethod] GetTicker/GetHistory/GetStatus + [SleipnirEvent] TickerUpdated via `IObservable<TickerSnapshot>`), `JobsController` (Start/List + [SleipnirEvent] Progress per job), `TickerFeed` + `JobRunner` singletons, `BinanceTickerSource`/`SyntheticTickerSource` behind `ITickerSource`, the committed `contract.sleipnir.json` |
| `src/api/` | Generated client (do not edit; `pnpm codegen`) |
| `src/TickerStore.ts` | App-wide store: 1 SSE subscription for the app's lifetime |
| `src/JobWatch.ts` | One job's progress stream (per page, sequenced, completes) |
| `src/Pages/` | `/` live dashboard (price, 24h stats, sparkline, event log) · `/history` ring-buffer table · `/jobs` form + job list · `/jobs/{jobId}` progress |
| `src/components/` | `Sparkline.tsazor` (+`.tsazor.css` — scoped CSS isolation) · `EventLog.tsazor` |
| `scripts/` | `verify.mjs` (E2E, self-starting) · `codegen.mjs` (from the contract file; `--check`, `--contract`, `--live`) |
| `test/` | `node --test` over the pure helpers (`src/formatters.mjs`, `src/jobs.mjs`) |

## Ports

API :5310 · Vite :5311 (`strictPort`, proxy: `/api/sleipnir`, `/sleipnirws`).
Blazing Pizza uses :5300/:5301, the demo :5199.

## Known limitations

- **No resume across reload** for the ticker: a reload subscribes again. `sleipnir-client` can
  resume (`router.resume(subscriptionId, lastEventId, handlers)`), but the generated client
  does not expose the router; `Resumable = true` stays on the server (in-process replay). The
  job stream needs no resume: the server replays the whole job to every subscriber.
- Jobs live in memory (the last 20); a restarted API forgets them.
- `TICKER_MODE=auto` only tries Binance within a 10 s budget — after that the feed is
  synthetic for the rest of this API process's lifetime (restart to try again).
