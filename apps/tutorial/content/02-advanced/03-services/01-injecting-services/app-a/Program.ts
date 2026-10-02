import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import { Cart } from "./Cart";

createTsazorApp({
    root: App,
    services: (services) => {
        services.registerType(Cart);
    },
});
