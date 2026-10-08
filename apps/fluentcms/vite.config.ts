import { defineConfig } from "vite";
import { tsazor } from "@tsazor/vite-plugin";

// The BFF (bff/, :5341) holds FluentCMS's API token and the user's JWT; the app talks only to it.
// Its API, its session endpoints and FluentCMS's files are same-origin through this proxy.
export default defineConfig({
    plugins: [tsazor()],
    server: {
        port: 5342,
        strictPort: true,
        proxy: {
            "^/(api|bff|files)/": "http://localhost:5341",
        },
    },
});
