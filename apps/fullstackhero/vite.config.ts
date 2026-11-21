import path from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tsazor } from "@tsazor/vite-plugin";

// The original's vite.config.ts with Tsazor's plugin in place of React's. fullstackhero's API (scripts/backend.mjs)
// answers through this proxy, so the browser stays same-origin, as in the original. Its HTTPS endpoint, as the AppHost
// gives the original (`VITE_API_BASE_URL`): the HTTP one redirects to it with a 307, which drops the Authorization
// header. The public files — /config.json (the runtime configuration), the logo, the favicons — are the original's,
// from the clone.
const api = process.env.VITE_API_BASE_URL ?? "https://localhost:7030";
const upstream = path.resolve(import.meta.dirname, ".backend/dotnet-starter-kit/clients/admin");

export default defineConfig({
    // routes.tsx's lazy pages: every page but the login and the dashboard is a chunk of its own (src/pages/<area>/).
    plugins: [tsazor({ lazyRoutes: ["src/pages/*/**"] }), tailwindcss()],
    publicDir: path.join(upstream, "public"),
    resolve: {
        alias: { "@": path.resolve(import.meta.dirname, "src") },
    },
    server: {
        port: Number(process.env.PORT ?? 5372),
        strictPort: true,
        // The pages are lazy chunks, compiled on their first request; a test run that opens them all at once would
        // wait on the compiles. Compiled at startup instead.
        warmup: { clientFiles: ["./src/main.ts", "./src/**/*.tsazor"] },
        proxy: {
            "/api": { target: api, changeOrigin: true, secure: false },
            // The original's proxy sends a page load of the SPA's own /health route to the API too (its health spec
            // works around it for :5173 only; port-fullstackhero.md, U1): a document request gets the app.
            "/health": {
                target: api,
                changeOrigin: true,
                secure: false,
                bypass: (request) => (String(request.headers.accept ?? "").includes("text/html") ? "/index.html" : undefined),
            },
            "/openapi": { target: api, changeOrigin: true, secure: false },
            "/scalar": { target: api, changeOrigin: true, secure: false },
        },
    },
    preview: { port: 5373, strictPort: true },
});
