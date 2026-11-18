using System;
using System.Collections.Generic;
using SleipnirCommon.Models;
using SleipnirCommon.Results;
using SleipnirCore.Attributes;
using SleipnirTicker.Api.Feeds;
using SleipnirTicker.Api.Models;

namespace SleipnirTicker.Api.Controllers;

/// <summary>
/// Per-entity event streams: Start creates a job, Progress(jobId) streams that one job —
/// history, live steps, completion. Start answers a validation failure with 400
/// (InvalidArgument) and the field errors as JSON in error.details: { "label": ["…"] }.
/// </summary>
[SleipnirController("Jobs")]
public sealed class JobsController(JobRunner jobs)
{
    [SleipnirMethod("Start")]
    public SleipnirResponse<AnalysisJob> Start(AnalysisRequest request)
    {
        var (job, errors) = jobs.Start(request);
        return errors is null
            ? SleipnirResponse<AnalysisJob>.Ok(job!)
            : SleipnirResponse<AnalysisJob>.Fail(400, "The analysis request is invalid.",
                SleipnirErrorCategory.InvalidArgument, JobRunner.ToDetails(errors));
    }

    [SleipnirMethod("List")]
    public IReadOnlyList<AnalysisJob> List() => jobs.List();

    /// <summary>Not Resumable: the job's ReplaySubject replays the whole job to every subscriber.</summary>
    [SleipnirEvent("Progress", BufferCapacity = 64)]
    public IObservable<JobProgress> Progress(int jobId) => jobs.Progress(jobId);
}
