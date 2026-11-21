using Microsoft.Extensions.FileProviders;

// The gateway in front of both apps (YARP). The browser only ever talks to it, so the Blazor
// app, its API and the Tsazor pages share one origin — and one auth cookie.
//
// - Migrated routes (Tsazor:Routes) get the Tsazor build's index.html; its assets are under /tsazor/.
// - Everything else is proxied to the Blazor Server app (pages, /_blazor, /api, /auth, …).
//
// Migrating a page = building it in Tsazor and adding its route to Tsazor:Routes. Removing the
// route switches back to the Blazor page.

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

var dist = Path.GetFullPath(builder.Configuration["Tsazor:Dist"] ?? Path.Combine(builder.Environment.ContentRootPath, "..", "dist"));
if (!File.Exists(Path.Combine(dist, "index.html")))
    throw new InvalidOperationException($"No Tsazor build at {dist} — run `pnpm --filter migration-sample build` first.");

// The Tsazor build's assets: vite `base: "/tsazor/"` prefixes their URLs (dist/assets/x.js is /tsazor/assets/x.js).
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(dist),
    RequestPath = "/tsazor",
});
// Routing after the static files: the proxy's catch-all route would otherwise be selected first,
// and the static file middleware skips requests that already have an endpoint.
app.UseRouting();

// The migrated routes: the Tsazor app's index.html; its router takes it from there.
var indexHtml = Path.Combine(dist, "index.html");
foreach (var route in builder.Configuration.GetSection("Tsazor:Routes").Get<string[]>() ?? [])
{
    app.MapGet(route, () => Results.File(indexHtml, "text/html"));
    app.MapGet($"{route.TrimEnd('/')}/{{**rest}}", () => Results.File(indexHtml, "text/html"));
}

// Everything else: the Blazor Server app (including its WebSocket at /_blazor).
app.UseWebSockets();
app.MapReverseProxy();

app.Run();
