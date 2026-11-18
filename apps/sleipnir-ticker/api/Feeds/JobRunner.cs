using System;
using System.Collections.Generic;
using System.Linq;
using System.Reactive.Linq;
using System.Reactive.Subjects;
using System.Text.Json;
using System.Threading.Tasks;
using SleipnirTicker.Api.Models;

namespace SleipnirTicker.Api.Feeds;

/// <summary>
/// Runs analysis jobs over the recorded price history. Each job owns a ReplaySubject: every
/// subscriber of Jobs.Progress gets the job's history first, then the live steps, then the
/// completion — a subscriber that comes late (or after the end) misses nothing.
/// </summary>
public sealed class JobRunner(TickerFeed feed)
{
    public const int Steps = 10;
    public const int MinPoints = 10;
    public const int MaxLabel = 40;
    /// <summary>Jobs kept for late subscribers; older ones are dropped.</summary>
    private const int Keep = 20;
    private static readonly TimeSpan StepDelay = TimeSpan.FromMilliseconds(250);

    private readonly object _gate = new();
    private readonly List<Entry> _jobs = new();
    private int _nextId = 1;

    /// <summary>Newest first.</summary>
    public IReadOnlyList<AnalysisJob> List()
    {
        lock (_gate)
        {
            return _jobs.Select(e => e.Job).Reverse().ToList();
        }
    }

    /// <summary>
    /// Validates the request against server state and starts the job, or returns the field
    /// errors keyed by the wire names of AnalysisRequest (camelCase).
    /// </summary>
    public (AnalysisJob? Job, Dictionary<string, string[]>? Errors) Start(AnalysisRequest request)
    {
        var errors = new Dictionary<string, List<string>>();
        void Add(string field, string message)
        {
            if (!errors.TryGetValue(field, out var list)) errors[field] = list = new();
            list.Add(message);
        }

        var label = request.Label?.Trim() ?? "";
        var recorded = feed.History(TickerFeed.BufferCapacity).Points.Count;
        lock (_gate)
        {
            if (label.Length == 0) Add("label", "The label is required.");
            else if (label.Length > MaxLabel) Add("label", $"The label must be at most {MaxLabel} characters.");
            else if (_jobs.Any(e => e.Job.State == "running" && string.Equals(e.Job.Label, label, StringComparison.OrdinalIgnoreCase)))
                Add("label", $"A job named '{label}' is already running.");

            if (request.Points < MinPoints) Add("points", $"Analyze at least {MinPoints} points.");
            else if (request.Points > recorded) Add("points", $"Only {recorded} points are recorded so far.");

            if (errors.Count > 0) return (null, errors.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray()));

            var job = new AnalysisJob(_nextId++, label, request.Points, "running", DateTime.UtcNow);
            var entry = new Entry(job, new ReplaySubject<JobProgress>());
            _jobs.Add(entry);
            while (_jobs.Count > Keep) _jobs.RemoveAt(0);
            _ = Task.Run(() => RunAsync(entry));
            return (job, null);
        }
    }

    /// <summary>The job's progress stream (history + live + completion); an unknown id fails.</summary>
    public IObservable<JobProgress> Progress(int jobId)
    {
        lock (_gate)
        {
            var entry = _jobs.FirstOrDefault(e => e.Job.Id == jobId);
            return entry is null
                ? Observable.Throw<JobProgress>(new KeyNotFoundException($"Job {jobId} does not exist."))
                : entry.Stream.AsObservable();
        }
    }

    /// <summary>The error details of a failed validation: the field-error map as JSON.</summary>
    public static string ToDetails(Dictionary<string, string[]> errors) => JsonSerializer.Serialize(errors);

    private async Task RunAsync(Entry entry)
    {
        var points = feed.History(entry.Job.Points).Points;
        var seq = 0;
        for (var step = 1; step <= Steps; step++)
        {
            await Task.Delay(StepDelay);
            var analyzed = points.Count * step / Steps;
            entry.Stream.OnNext(new JobProgress(entry.Job.Id, ++seq, step * 100 / Steps, "running",
                $"{analyzed} of {points.Count} points analyzed", null));
        }

        var prices = points.Select(p => p.Price).ToList();
        var first = prices[0];
        var result = new AnalysisResult(prices.Min(), prices.Max(), Math.Round(prices.Average(), 2),
            first == 0 ? 0 : Math.Round((prices[^1] - first) / first * 100, 3));
        lock (_gate)
        {
            entry.Job = entry.Job with { State = "done" };
        }

        entry.Stream.OnNext(new JobProgress(entry.Job.Id, ++seq, 100, "done", "Done", result));
        entry.Stream.OnCompleted();
    }

    private sealed class Entry(AnalysisJob job, ReplaySubject<JobProgress> stream)
    {
        public AnalysisJob Job { get; set; } = job;
        public ReplaySubject<JobProgress> Stream { get; } = stream;
    }
}
