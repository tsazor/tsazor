import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

// BlazorHero's server (scripts/backend.mjs, :5350) is the API: same-origin through this proxy — its API, the
// SignalR hub (WebSockets too) and the uploaded files.
export default defineConfig({
    plugins: [tsazor()],
    server: {
        port: 5352,
        strictPort: true,
        proxy: {
            "^/(api|Files)/": "http://localhost:5350",
            "/signalRHub": { target: "http://localhost:5350", ws: true },
        },
    },
});
