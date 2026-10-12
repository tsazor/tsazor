import "@tsazor/fluent/fluent.css";
import "./app.css";
import { createTsazorApp, TsazorHttp } from "@tsazor/runtime";
import { addFluent } from "@tsazor/fluent";
import routes from "virtual:tsazor-routes";
import App from "./App.tsazor";

createTsazorApp({
    root: App,
    routes,
    services: (services) => {
        // Blazor: builder.Services.AddScoped(sp => new HttpClient { BaseAddress = ... })
        services.registerValue(TsazorHttp, new TsazorHttp({ baseUrl: document.baseURI }));
        addFluent(services);
    },
});
