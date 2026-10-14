import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import { OrdersWorker } from "./orders-client";

createTsazorApp({
    root: App,
    services: (services) => {
        // One worker for the app; it starts on the first call.
        services.registerType(OrdersWorker, { lifetime: "singleton" });
    },
});
