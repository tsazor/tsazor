using System;
using System.Threading;
using System.Threading.Tasks;
using SleipnirTicker.Api.Feeds;
using SleipnirTicker.Api.Models;

namespace SleipnirTicker.Api.Sources;

/// <summary>
/// Deterministic-ish fallback: a random walk starting near USD 60k, ~1 tick/s.
/// Enough to render the whole app (price, sparkline, log) without network.
/// </summary>
public sealed class SyntheticTickerSource : ITickerSource
{
    private readonly TickerFeed _feed;
    private readonly Random _rng = new();
    private decimal _price;

    public SyntheticTickerSource(TickerFeed feed, decimal startPrice)
    {
        _feed = feed;
        _price = startPrice;
    }

    public string Mode => "synthetic";

    public async Task RunAsync(CancellationToken ct)
    {
        _feed.SetStatus(new TickerFeedStatus(
            Mode, "synthetic", DateTime.UtcNow, 0, "synthetic feed (no upstream)"));
        while (!ct.IsCancellationRequested)
        {
            var percent = NextPercent();
            var change = _price * percent / 100m;
            _price = Math.Max(1m, _price + change);
            var now = DateTime.UtcNow;
            _feed.OnTick(new TickerSnapshot(
                Symbol: "BTCUSDT",
                LastPrice: Math.Round(_price, 2),
                PriceChange: Math.Round(change, 2),
                PriceChangePercent: percent,
                High: Math.Round(_price * 1.01m, 2),
                Low: Math.Round(_price * 0.99m, 2),
                Volume: Math.Round(30_000m + 500m * (decimal)percent, 2),
                QuoteVolume: Math.Round(_price * (30_000m + 500m * (decimal)percent), 2),
                EventTimeMs: new DateTimeOffset(now).ToUnixTimeMilliseconds(),
                ServerTimeUtc: now,
                Mode: Mode));
            try
            {
                await Task.Delay(1000, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private decimal NextPercent() => (decimal)(_rng.NextDouble() * 0.2 - 0.05);
}