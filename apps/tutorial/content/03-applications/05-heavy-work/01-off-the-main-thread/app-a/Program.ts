import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";

createTsazorApp({
    root: App,
    services: (services) => {
        // Services are registered here.
    },
});
