# Sleipnir Ticker — Live-Bitcoin-Viewer

Erste reale App, die **Tasor** mit **Sleipnir** verdrahtet: eine ASP.NET Core API
(NuGet `Sleipnir.Server`) relaisiert Binance-WebSocket-Ticker-Daten als
Command-API mit Server-Push-Events; das Tasor-Frontend rendert sie live —
ohne Polling, die Updates kommen per SSE-Event in die Komponenten.

## Starten

```bash
pnpm --filter sleipnir-ticker api     # API auf :5310 (TICKER_MODE siehe unten)
pnpm --filter sleipnir-ticker dev     # App auf :5311 (SSE/REST via Vite-Proxy)
```

Der Datenpfad endet nie still: der Binance-Feed `wss://stream.binance.com:9443/
ws/btcusdt@ticker` wird vom Server per `ClientWebSocket` angebunden (Reconnect
mit Backoff, proaktiver Reconnect vor Binance 24 h-Close). Wenn Binance nicht
erreichbar ist, fällt `TICKER_MODE=auto` (Default) nach 10 s auf einen
Synthetic-Feed (Random Walk) zurück — der Modus steht im `TickerFeedStatus`
und im Verbindungs-Badge der UI.

```bash
TICKER_MODE=auto|binance|synthetic
```

Verify (synthetic, deterministisch): `pnpm --filter sleipnir-ticker verify`

## Der generierte Client (Typesicherheit aus dem Contract)

Der TS-Client wird aus der Laufzeit-Discovery der API generiert — keine
handgeschriebenen Wrapper, die C#-Contracts (records in
`api/Controllers`/`api/Models`) sind die Quelle für alle Typen:

```bash
pnpm --filter sleipnir-ticker codegen   # startet ggf. die API selbst, generiert in src/api/
```

- `src/api/` enthält das generierte Resultat (`sleipnir-gen --lang ts
  --transport rest`) und ist **committed** — Verify braucht keine laufende API.
- Contract-Drift prüfen: `npx sleipnir-gen … --selfcheck` (Exit 4 bei Drift).
- Nutzt: `client.market.getTicker()` → `TypedResponse<TickerSnapshot>`
  (narrowed `data`), Events via `client.market.tickerUpdated(handlers)` →
  `Promise<SleipnirSubscription>`.

## Struktur

| Teil | Inhalt |
|---|---|
| `api/` | ASP.NET Core (net9.0): `MarketController` ([SleipnirMethod] GetTicker/GetHistory/GetStatus + [SleipnirEvent] TickerUpdated über `IObservable<TickerSnapshot>`), `TickerFeed`-Singleton, `BinanceTickerSource`/`SyntheticTickerSource` hinter `ITickerSource` |
| `src/TickerStore.ts` | App-weiter Store: 1 SSE-Subscription für die App-Laufzeit, Pages subscriben in `onInitialized` und unsubscriben in `dispose()` |
| `src/Pages/` | `/` Live-Dashboard (Preis, 24h-Stats, Sparkline, Event-Log) · `/history` Ring-Buffer-Tabelle |
| `src/components/` | `Sparkline.tazor` (+`.tazor.css` — Scoped-CSS-Isolation) · `EventLog.tazor` |
| `scripts/` | `verify.mjs` (E2E, 15 Checks, self-starting) · `codegen.mjs` |
| `test/` | `node --test` über die Pure-Helper (`src/formatters.mjs`) |

## Ports

API :5310 · Vite :5311 (`strictPort`, Proxy: `/api/sleipnir`, `/sleipnirws`).
Blazing Pizza nutzt :5300/:5301, die Demo :5199.

## Bekannte Grenzen (v1)

- **Kein Resume über Reload**: die generierte Client-Oberfläche exponiert kein
  `router.resume(subscriptionId, lastEventId)` → ein Reload subskribiert neu.
  Serverseitig bleibt `Resumable = true` (gratis in-process Replay).
- Sidecar-`TICKER_MODE=auto` hält Binance nur mit 10-s-Budget — danach ist der
  Feed für diese API-Laufzeit synthetic (Re-Start für erneuten Versuch).