using System.Globalization;
using System.Net;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;
using Yarp.ReverseProxy.Forwarder;

namespace Tsazor.AspNetCore;

/// <summary><c>AddTsazor</c>: the services behind <c>MapTsazor()</c>.</summary>
public static class TsazorServiceCollectionExtensions
{
    /// <summary>Adds what <c>MapTsazor()</c> needs; <paramref name="configure"/> sets the <see cref="TsazorOptions"/>.</summary>
    public static IServiceCollection AddTsazor(this IServiceCollection services, Action<TsazorOptions>? configure = null)
    {
        var options = services.AddOptions<TsazorOptions>();
        if (configure is not null) options.Configure(configure);
        services.AddHttpForwarder();
        services.TryAddSingleton<TsazorDevServer>();
        services.AddHostedService(provider => provider.GetRequiredService<TsazorDevServer>());
        return services;
    }
}

/// <summary><c>MapTsazor</c>: serves the Tsazor app.</summary>
public static class TsazorApplicationExtensions
{
    internal const string NoCache = "no-cache";
    internal const string Immutable = "public, max-age=31536000, immutable";

    /// <summary>
    /// Serves the Tsazor app. In production (and in Development without a dev server): the files of
    /// <see cref="TsazorOptions.SpaRoot"/>, read from disk on every request, and its index file for every GET of a
    /// path without a file extension outside <see cref="TsazorOptions.ApiPrefixes"/>; a missing file and a path below
    /// an API prefix are a 404. In Development with <see cref="TsazorOptions.ClientProject"/> set: every request no
    /// endpoint takes goes to the Vite dev server (started when needed), the HMR WebSocket and streams included.
    /// Call it after the app's own endpoints and middleware (authentication, authorization); its endpoint is a
    /// fallback, so the app's endpoints win.
    /// </summary>
    /// <returns>The fallback endpoint, e.g. for <c>.RequireAuthorization()</c>.</returns>
    public static IEndpointConventionBuilder MapTsazor(this WebApplication app)
    {
        var options = app.Services.GetRequiredService<IOptions<TsazorOptions>>().Value;
        var environment = app.Environment;
        var apiPrefixes = options.ApiPrefixes.Select(prefix => new PathString(Normalize(prefix))).ToArray();

        foreach (var root in options.FileRoots)
        {
            app.UseStaticFiles(StaticFiles(new SpaFileProvider(Resolve(environment, root.Directory)), Normalize(root.RequestPath), options));
        }

        var devServerEnabled = environment.IsDevelopment() && (options.DevServer.Enabled ?? options.ClientProject is not null);
        if (devServerEnabled) return MapDevServer(app, apiPrefixes);

        var spaRoot = new SpaFileProvider(Resolve(environment, options.SpaRoot));
        app.UseStaticFiles(StaticFiles(spaRoot, "", options));
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Tsazor.AspNetCore");
        var warned = 0;

        // MapFallback's route ({*path:nonfile}) takes only paths without a file extension: a missing .js stays a 404.
        return app.MapFallback(context =>
        {
            if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method)
                || IsApi(context.Request.Path, apiPrefixes))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return Task.CompletedTask;
            }
            var index = spaRoot.GetFileInfo(options.IndexFile);
            if (!index.Exists || index.IsDirectory || index.PhysicalPath is null)
            {
                if (Interlocked.Exchange(ref warned, 1) == 0)
                {
                    logger.LogWarning("Tsazor: no {Index} in {Root}; is the client built (dotnet publish, or dotnet build -c Release)?", options.IndexFile, spaRoot.Root);
                }
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return Task.CompletedTask;
            }
            context.Response.Headers.CacheControl = NoCache;
            var lastModified = index.LastModified;
            var tag = new EntityTagHeaderValue($"\"{(lastModified.ToFileTime() ^ index.Length).ToString("x", CultureInfo.InvariantCulture)}\"");
            return TypedResults.PhysicalFile(index.PhysicalPath, "text/html; charset=utf-8", lastModified: lastModified, entityTag: tag)
                .ExecuteAsync(context);
        });
    }

    private static IEndpointConventionBuilder MapDevServer(WebApplication app, PathString[] apiPrefixes)
    {
        var devServer = app.Services.GetRequiredService<TsazorDevServer>();
        devServer.Mapped = true;
        var forwarder = app.Services.GetRequiredService<IHttpForwarder>();
        var client = new HttpMessageInvoker(new SocketsHttpHandler
        {
            UseProxy = false,
            AllowAutoRedirect = false,
            AutomaticDecompression = DecompressionMethods.None,
            UseCookies = false,
            ActivityHeadersPropagator = null,
            ConnectTimeout = TimeSpan.FromSeconds(15),
        });
        var destination = devServer.Url.GetLeftPart(UriPartial.Authority);

        return app.MapFallback("{**path}", async context =>
        {
            if (IsApi(context.Request.Path, apiPrefixes))
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return;
            }
            if (!await devServer.WaitUntilReadyAsync(context.RequestAborted))
            {
                context.Response.StatusCode = StatusCodes.Status502BadGateway;
                await context.Response.WriteAsync($"The Vite dev server at {destination} did not start; see the app's log.");
                return;
            }
            var error = await forwarder.SendAsync(context, destination, client, ForwarderRequestConfig.Empty, HttpTransformer.Default);
            if (error != ForwarderError.None && !context.Response.HasStarted)
            {
                context.Response.StatusCode = StatusCodes.Status502BadGateway;
            }
        });
    }

    private static StaticFileOptions StaticFiles(IFileProvider files, string requestPath, TsazorOptions options)
    {
        var immutable = options.ImmutablePrefixes.Select(prefix => new PathString(Normalize(prefix))).ToArray();
        return new StaticFileOptions
        {
            FileProvider = files,
            RequestPath = requestPath,
            ContentTypeProvider = new FileExtensionContentTypeProvider(),
            OnPrepareResponse = context =>
            {
                var path = context.Context.Request.Path;
                context.Context.Response.Headers.CacheControl =
                    requestPath == "" && immutable.Any(prefix => path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase))
                        ? Immutable
                        : NoCache;
            },
        };
    }

    private static bool IsApi(PathString path, PathString[] prefixes) =>
        prefixes.Any(prefix => path.StartsWithSegments(prefix, StringComparison.OrdinalIgnoreCase));

    private static string Normalize(string prefix) => "/" + prefix.Trim().Trim('/');

    private static string Resolve(IWebHostEnvironment environment, string directory) =>
        Path.GetFullPath(Path.Combine(environment.ContentRootPath, directory));
}
