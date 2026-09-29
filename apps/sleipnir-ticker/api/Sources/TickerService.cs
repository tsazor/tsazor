using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SleipnirTicker.Api.Feeds;

namespace SleipnirTicker.Api.Sources;

/// <summary>
/// Chooses the active ticker source from TICKER_MODE (auto | binance | synthetic).
/// "auto" gives Binance a short connect budget and falls back to synthetic so
/// the app still works end-to-end in offline/CI environments.
/// </summary>
public sealed class TickerService : BackgroundService
{
    private static readonly TimeSpan BinanceBudget = TimeSpan.FromSeconds(10);

    private readonly TickerFeed _feed;
    private readonly string _mode;
    private readonly ILogger<TickerService> _logger;

    public TickerService(TickerFeed feed, string mode, ILogger<TickerService> logger)
    {
        _feed = feed;
        _mode = (mode ?? "auto").Trim().ToLowerInvariant();
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        // First paint must not read an empty sparkline — pre-warm the ring.
        _feed.Seed(60, 60_000m);

        try
        {
            if (_mode == "synthetic")
            {
                await new SyntheticTickerSource(_feed, StartPrice()).RunAsync(ct);
                return;
            }

            // binance (explicit, or auto): run in the background; in auto mode
            // we abandon it for a synthetic feed when the budget expires unused.
            // One active source at a time — interleaved snapshots would corrupt Mode.
            var binanceCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            var binance = new BinanceTickerSource(_feed, "BTCUSDT", _logger, "binance");
            var running = binance.RunAsync(binanceCts.Token);

            if (_mode == "auto" && !WaitForFirstTick(running))
            {
                _logger.LogWarning("Binance not live within budget; falling back to synthetic feed");
                await binanceCts.CancelAsync();
                await Silent(running);
                await new SyntheticTickerSource(_feed, StartPrice()).RunAsync(ct);
                return;
            }

            await running;
        }
        catch (OperationCanceledException)
        {
            // shutdown or deliberate fallback stop — not an error
        }
    }

    /// <summary>True as soon as a real Binance tick has arrived; false at budget expiry.</summary>
    private bool WaitForFirstTick(Task running)
    {
        var deadline = DateTime.UtcNow + BinanceBudget;
        while (DateTime.UtcNow < deadline && !running.IsCompleted)
        {
            if (_feed.Current.Mode == "binance") return true;
            Thread.Sleep(250);
        }

        return _feed.Current.Mode == "binance";
    }

    private static async Task Silent(Task task)
    {
        try
        {
            await task;
        }
        catch
        {
            // expected on cancellation-after-budget
        }
    }

    private static decimal StartPrice() => 60_000m + new Random().Next(-500, 500);
}