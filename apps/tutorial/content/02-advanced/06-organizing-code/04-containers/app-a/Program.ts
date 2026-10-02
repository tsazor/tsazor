import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import { TodoStore } from "./TodoStore";

createTsazorApp({
    root: App,
    services: (services) => {
        services.registerType(TodoStore);
    },
});
