import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import { english, german } from "./Texts";

createTsazorApp({
    root: App,
    localization: {
        defaultCulture: "en-US",
        tables: { "en-US": english, "de-DE": german },
    },
});
