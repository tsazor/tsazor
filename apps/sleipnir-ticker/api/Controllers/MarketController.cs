using System;
using System.Reactive;
using SleipnirCore.Attributes;
using SleipnirTicker.Api.Feeds;
using SleipnirTicker.Api.Models;

namespace SleipnirTicker.Api.Controllers;

[SleipnirController("Market")]
public sealed class MarketController(TickerFeed feed)
{
    [SleipnirMethod("GetTicker")]
    public TickerSnapshot GetTicker() => feed.Current;

    [SleipnirMethod("GetHistory")]
    public TickerHistory GetHistory(int count = 600) => feed.History(count);

    [SleipnirMethod("GetStatus")]
    public TickerFeedStatus GetStatus() => feed.Status;

    [SleipnirEvent("TickerUpdated", Resumable = true, BufferCapacity = 600)]
    public IObservable<TickerSnapshot> TickerUpdated() => feed.Stream;
}