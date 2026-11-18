using System;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using SleipnirHub.Extensions;
using SleipnirServer;
using SleipnirTicker.Api.Feeds;
using SleipnirTicker.Api.Sources;

var builder = WebApplication.CreateBuilder(args);

if (builder.Environment.IsDevelopment())
{
    builder.WebHost.UseStaticWebAssets();
}

var mode = builder.Configuration["TICKER_MODE"] ?? Environment.GetEnvironmentVariable("TICKER_MODE") ?? "auto";

builder.Services.AddSingleton<TickerFeed>();
builder.Services.AddSingleton<JobRunner>();
builder.Services.AddSingleton(sp => new TickerService(
    sp.GetRequiredService<TickerFeed>(),
    mode,
    sp.GetRequiredService<ILogger<TickerService>>()));
builder.Services.AddHostedService(sp => sp.GetRequiredService<TickerService>());

// --- Sleipnir: engine + transports (REST + WebSocket + SSE) ---
builder.Services.AddSleipnir(o =>
{
    o.EnableDetailedErrors = builder.Environment.IsDevelopment();
    o.EnableObservability = true;
});

var app = builder.Build();

app.UseStaticFiles();
app.UseRouting();

app.UseSleipnirTransports();
app.MapSleipnir();

app.Run();