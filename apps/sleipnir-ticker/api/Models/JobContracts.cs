using System;

namespace SleipnirTicker.Api.Models;

/// <summary>The form the client posts to Jobs.Start (camelCase on the wire: label, points).</summary>
public record AnalysisRequest(string Label, int Points);

/// <summary>One analysis job as the job list shows it.</summary>
public record AnalysisJob(int Id, string Label, int Points, string State /* running | done */, DateTime StartedUtc);

/// <summary>The outcome, set on the job's last progress event.</summary>
public record AnalysisResult(decimal Min, decimal Max, decimal Average, decimal ChangePercent);

/// <summary>
/// One step of a job, published on Jobs.Progress. Seq starts at 1 and grows by 1 per event,
/// so a client can drop an event it has already applied.
/// </summary>
public record JobProgress(
    int JobId,
    int Seq,
    int Percent,
    string State /* running | done */,
    string Message,
    AnalysisResult? Result);
