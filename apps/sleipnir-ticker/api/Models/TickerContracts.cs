using System;

namespace SleipnirTicker.Api.Models;

/// <summary>One market snapshot, published to every subscribed client via TickerUpdated.</summary>
public record TickerSnapshot(
    string Symbol,
    decimal LastPrice,
    decimal PriceChange,
    decimal PriceChangePercent,
    decimal High,
    decimal Low,
    decimal Volume,
    decimal QuoteVolume,
    long EventTimeMs,
    DateTime ServerTimeUtc,
    string Mode /* binance | synthetic */);

/// <summary>A single historical price observation (ring-buffer entry).</summary>
public record PricePoint(long T, decimal Price);

public record TickerHistory(string Symbol, IReadOnlyList<PricePoint> Points);

/// <summary>Upstream feed health, surfaced in the UI connection badge.</summary>
public record TickerFeedStatus(
    string Mode,          // auto | binance | synthetic
    string State,         // live | reconnecting | synthetic
    DateTime? ConnectedSinceUtc,
    int Reconnects,
    string? Detail);