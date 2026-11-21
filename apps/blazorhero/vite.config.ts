import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

// BlazorHero's server (scripts/backend.mjs, :5350) is the API: same-origin through this proxy — its API, the
// SignalR hub (WebSockets too), the uploaded files, the client's static media (the notification sound, the icon),
// and the pages the menu opens in a tab of their own (Swagger, the Hangfire dashboard). The built app (vite preview,
// scripts/verify.mjs) goes through the same proxy. Vite matches a pattern against the URL with its query, so a path
// may end in `?` too: Hangfire's own links are `/jobs?period=week`.
export default defineConfig({
    plugins: [tsazor()],
    server: {
        port: 5352,
        strictPort: true,
        proxy: {
            "^/(api|Files|media|swagger|jobs)([/?]|$)": "http://localhost:5350",
            "/favicon.ico": "http://localhost:5350",
            "/signalRHub": { target: "http://localhost:5350", ws: true },
        },
    },
    preview: { port: 5353, strictPort: true },
});
