import { createTsazorApp } from "@tsazor/runtime";
import { Toaster } from "@tsazor/bootstrap";
import App from "./App.tsazor";

createTsazorApp({
    root: App,
    services: (services) => {
        // The app's toasts: any component injects it; a ToastRegion shows them.
        services.registerType(Toaster, { singleton: true });
    },
});
