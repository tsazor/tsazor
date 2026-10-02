import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import { Tally } from "./Tally";

createTsazorApp({
    root: App,
    services: (services) => {
        services.registerType(Tally, { lifetime: "transient" });
    },
});
