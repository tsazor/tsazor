using System.Threading.Tasks;

namespace SleipnirTicker.Api.Sources;

/// <summary>
/// Where live ticks come from. Synthetic exists so the app and its verify
/// script stay deterministic when Binance is unreachable (offline, 451s).
/// </summary>
public interface ITickerSource
{
    /// <summary>Auto-detected mode ("binance" or "synthetic") — surfaced to clients.</summary>
    string Mode { get; }

    /// <summary>Runs the feed until cancelled; never throws.</summary>
    Task RunAsync(System.Threading.CancellationToken ct);
}