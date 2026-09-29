using System;
using System.Collections.Generic;
using System.Reactive.Subjects;
using SleipnirTicker.Api.Models;

namespace SleipnirTicker.Api.Feeds;

/// <summary>
/// Singleton over the live data path: owns the hot observable handed out by
/// the Sleipnir event method, the current snapshot and a bounded history ring
/// (the sparkline/graph seed for fresh clients).
/// </summary>
public sealed class TickerFeed
{
    public const int BufferCapacity = 600;

    private readonly object _gate = new();
    private readonly Subject<TickerSnapshot> _stream = new();
    private readonly List<PricePoint> _ring = new() { Capacity = BufferCapacity };

    public TickerFeed()
    {
        Status = new TickerFeedStatus("auto", "reconnecting", null, 0, "starting");
        Current = InitialSnapshot();
    }

    public Subject<TickerSnapshot> Stream => _stream;
    public TickerSnapshot Current { get; private set; }
    public TickerFeedStatus Status { get; private set; }

    public TickerHistory History(int count)
    {
        lock (_gate)
        {
            var take = Math.Min(Math.Max(count, 0), _ring.Count);
            var points = _ring.GetRange(_ring.Count - take, take);
            return new TickerHistory(Current.Symbol, points);
        }
    }

    /// <summary>Bumped by the active source on every received tick (any mode).</summary>
    public void OnTick(TickerSnapshot snapshot)
    {
        lock (_gate)
        {
            Current = snapshot;
            _ring.Add(new PricePoint(snapshot.EventTimeMs, snapshot.LastPrice));
            if (_ring.Count > BufferCapacity)
            {
                _ring.RemoveRange(0, _ring.Count - BufferCapacity);
            }
        }

        _stream.OnNext(snapshot);
    }

    public void SetStatus(TickerFeedStatus status)
    {
        lock (_gate)
        {
            Status = status;
        }
    }

    /// <summary>
    /// Pre-warms the buffer with `count` points spaced 1 s apart, ending at
    /// `lastPrice` — so the sparkline is not empty on first paint (clients
    /// that connect fresh read GetHistory before ticks accumulate).
    /// </summary>
    public void Seed(int count, decimal lastPrice)
    {
        var now = DateTime.UtcNow;
        lock (_gate)
        {
            for (var i = 0; i < count; i++)
            {
                var t = new DateTimeOffset(now).ToUnixTimeMilliseconds() - count * 1000L + i * 1000L;
                _ring.Add(new PricePoint(t, lastPrice));
            }

            if (_ring.Count > BufferCapacity)
            {
                _ring.RemoveRange(0, _ring.Count - BufferCapacity);
            }
        }
    }

    private static TickerSnapshot InitialSnapshot()
    {
        var now = DateTime.UtcNow;
        return new TickerSnapshot("BTCUSDT", 0m, 0m, 0m, 0m, 0m, 0m, 0m,
            new DateTimeOffset(now).ToUnixTimeMilliseconds(), now, "unknown");
    }
}