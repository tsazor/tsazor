using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.WebSockets;
using Microsoft.Extensions.Logging;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using SleipnirTicker.Api.Feeds;
using SleipnirTicker.Api.Models;

namespace SleipnirTicker.Api.Sources;

/// <summary>
/// Relays Binance's 24hr-ticker stream (btcusdt@ticker, ~1s cadence) into the feed.
/// Reconnects with capped backoff and proactively resubscribes at ~23h
/// (Binance force-closes connections after 24h).
/// </summary>
public sealed class BinanceTickerSource : ITickerSource
{
    public const string StreamUrl = "wss://stream.binance.com:9443/ws/btcusdt@ticker";

    private static readonly int[] BackoffSeconds = [1, 2, 5, 10, 30];
    private static readonly TimeSpan ConnectBudget = TimeSpan.FromSeconds(10);

    public BinanceTickerSource(TickerFeed feed, string symbol, ILogger logger, string mode)
    {
        _feed = feed;
        _logger = logger;
        _symbol = symbol;
        Mode = mode;
    }

    private readonly TickerFeed _feed;
    private readonly ILogger _logger;
    private readonly string _symbol;
    private bool _haveRealSnapshot;

    // "binance" when chosen explicitly, "auto" while it is only trying.
    public string Mode { get; }

    public async Task RunAsync(CancellationToken ct)
    {
        var attempt = 0;
        while (!ct.IsCancellationRequested)
        {
            var startedAt = DateTime.UtcNow;
            try
            {
                using var ws = new ClientWebSocket();
                ws.Options.SetRequestHeader("User-Agent", "sleipnir-ticker/0.1");
                using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                connectCts.CancelAfter(ConnectBudget);
                await ws.ConnectAsync(new Uri(StreamUrl), connectCts.Token);
                _haveRealSnapshot = false;
                _feed.SetStatus(new TickerFeedStatus(
                    Mode, Mode == "binance" ? "live" : Mode,
                    DateTime.UtcNow, 0, $"connected {_symbol} @ {StreamUrl}"));
                await ReceiveLoopAsync(ws, ct); // throws on close/error → reconnect
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                var delay = BackoffSeconds[Math.Min(attempt, BackoffSeconds.Length - 1)];
                attempt++;
                _logger.LogWarning(ex, "Binance feed failed; reconnect in {Delay}s", delay);
                _feed.SetStatus(FeedStatus(
                    "reconnecting", $"upstream unavailable, retry {attempt} in {delay}s"));
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(delay), ct);
                }
                catch (OperationCanceledException)
                {
                    break;
                }
            }

            if (ct.IsCancellationRequested) break;
            attempt = DateTime.UtcNow - startedAt > TimeSpan.FromMinutes(5) ? 0 : attempt;
        }
    }

    private TickerFeedStatus FeedStatus(string state, string? detail = null) =>
        new(Mode, state, null, 0, detail);

    private async Task ReceiveLoopAsync(ClientWebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[8 * 1024];
        var connectedAt = DateTime.UtcNow;
        var message = new StringBuilder();
        while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
        {
            // Proactive reconnect before Binance's 24h forced close.
            if (DateTime.UtcNow - connectedAt > TimeSpan.FromHours(23))
            {
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "renewing", ct);
                return;
            }

            message.Clear();
            WebSocketReceiveResult result;
            do
            {
                result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    throw new InvalidOperationException("upstream sent close frame");
                }

                message.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
            }
            while (!result.EndOfMessage);

            ParseAndPublish(message.ToString());
        }
    }

    /// <summary> btcusdt@ticker 24hrTicker payload: c=last, p=change, P=change%, h/l=24h high/low, v=base vol, q=quote vol, E=event time (all strings).</summary>
    internal void ParseAndPublish(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var snapshot = new TickerSnapshot(
                Symbol: root.GetProperty("s").GetString() ?? _symbol,
                LastPrice: ParseDec(root.GetProperty("c")),
                PriceChange: ParseDec(root.GetProperty("p")),
                PriceChangePercent: ParseDec(root.GetProperty("P")),
                High: ParseDec(root.GetProperty("h")),
                Low: ParseDec(root.GetProperty("l")),
                Volume: ParseDec(root.GetProperty("v")),
                QuoteVolume: ParseDec(root.GetProperty("q")),
                EventTimeMs: root.GetProperty("E").GetInt64(),
                ServerTimeUtc: DateTime.UtcNow,
                Mode: "binance");
            var hasRealData = snapshot.LastPrice > 0m;
            if (hasRealData)
            {
                _haveRealSnapshot = true;
                _feed.SetStatus(new TickerFeedStatus(
                    Mode, _haveRealSnapshot ? "live" : "reconnecting",
                    DateTime.UtcNow, 0, null));
                _feed.OnTick(snapshot);
            }
        }
        catch (JsonException ex)
        {
            _logger.LogWarning(ex, "malformed ticker payload");
        }
    }

    private static decimal ParseDec(JsonElement e) =>
        decimal.Parse(e.GetString() ?? "0", CultureInfo.InvariantCulture);
}