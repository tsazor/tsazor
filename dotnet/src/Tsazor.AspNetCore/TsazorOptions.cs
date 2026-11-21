namespace Tsazor.AspNetCore;

/// <summary>How <c>MapTsazor()</c> serves the Tsazor app: set in <c>AddTsazor(o =&gt; …)</c>.</summary>
public sealed class TsazorOptions
{
    /// <summary>
    /// The client project's directory (the one with <c>package.json</c> and <c>vite.config.ts</c>), relative to the
    /// content root or absolute. Needed only for the dev server: it is where <see cref="TsazorDevServerOptions.Command"/> runs.
    /// </summary>
    public string? ClientProject { get; set; }

    /// <summary>
    /// The directory of the built app, relative to the content root or absolute. Default: <c>wwwroot</c>, where the
    /// build puts the client's <c>dist</c> on publish. Read on every request, so a new build needs no restart.
    /// </summary>
    public string SpaRoot { get; set; } = "wwwroot";

    /// <summary>The app's page, below <see cref="SpaRoot"/>. Served with <c>Cache-Control: no-cache</c>.</summary>
    public string IndexFile { get; set; } = "index.html";

    /// <summary>
    /// Path prefixes that belong to the server: no fallback to the app below them, a missing endpoint is a 404.
    /// Matched by whole segments (<c>/api</c> matches <c>/api/x</c>, not <c>/apiary</c>). Default: <c>/api</c>.
    /// </summary>
    public IList<string> ApiPrefixes { get; } = ["/api"];

    /// <summary>
    /// Path prefixes of files whose names carry a content hash (Vite's <c>build.assetsDir</c>): served with
    /// <c>Cache-Control: public, max-age=31536000, immutable</c>. Every other file gets <c>no-cache</c>. Default: <c>/assets</c>.
    /// </summary>
    public IList<string> ImmutablePrefixes { get; } = ["/assets"];

    /// <summary>Further directories served next to the app (<see cref="AddFileRoot"/>).</summary>
    public IList<TsazorFileRoot> FileRoots { get; } = [];

    /// <summary>The Vite dev server in Development.</summary>
    public TsazorDevServerOptions DevServer { get; } = new();

    /// <summary>
    /// Serves the files of <paramref name="directory"/> (relative to the content root or absolute) under
    /// <paramref name="requestPath"/>, with the same rules: no path above the directory, no dot files, <c>no-cache</c>.
    /// </summary>
    public TsazorOptions AddFileRoot(string requestPath, string directory)
    {
        FileRoots.Add(new TsazorFileRoot(requestPath, directory));
        return this;
    }
}

/// <summary>A directory served under a path next to the app.</summary>
public sealed record TsazorFileRoot(string RequestPath, string Directory);

/// <summary>The Vite dev server that <c>MapTsazor()</c> puts behind the app in Development.</summary>
public sealed class TsazorDevServerOptions
{
    /// <summary>
    /// Whether Development proxies to the dev server. Default: <see langword="true"/> when
    /// <see cref="TsazorOptions.ClientProject"/> is set. With <see langword="false"/>, Development serves
    /// <see cref="TsazorOptions.SpaRoot"/> as production does.
    /// </summary>
    public bool? Enabled { get; set; }

    /// <summary>The dev server's address. Default: <c>http://localhost:5173</c> (Vite's).</summary>
    public Uri Url { get; set; } = new("http://localhost:5173");

    /// <summary>
    /// The command that starts the dev server in <see cref="TsazorOptions.ClientProject"/> when nothing answers at
    /// <see cref="Url"/>; <c>{port}</c> is <see cref="Url"/>'s port. <see langword="null"/>: attach only, never start.
    /// </summary>
    public string? Command { get; set; } = "npm run dev -- --port {port} --strictPort";

    /// <summary>How long a request waits for the dev server to answer before it gets a 502.</summary>
    public TimeSpan StartupTimeout { get; set; } = TimeSpan.FromSeconds(60);
}
