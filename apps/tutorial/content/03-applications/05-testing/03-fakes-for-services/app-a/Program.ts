import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import { BakeryClock } from "./BakeryClock";

createTsazorApp({
    root: App,
    services: (services) => services.registerValue(BakeryClock, new BakeryClock()),
});
