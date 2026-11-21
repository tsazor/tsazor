import path from "node:path";
import { defineConfig } from "vitest/config";
import { tsazor } from "@tsazor/vite-plugin";

// The same plugin and alias as the app, so that tests import .tsazor files.
export default defineConfig({
    plugins: [tsazor()],
    resolve: {
        alias: { "@": path.resolve(import.meta.dirname, "src") },
    },
    test: { environment: "happy-dom", include: ["test/**/*.test.ts"] },
});
