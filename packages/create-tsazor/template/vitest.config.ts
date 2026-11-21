import { defineConfig } from "vitest/config";
import { tsazor } from "@tsazor/vite-plugin";

// The same plugin as the app, so that tests import .tsazor files.
export default defineConfig({
    plugins: [tsazor()],
    test: { environment: "happy-dom" },
});
