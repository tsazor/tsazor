import "@tsazor/fluent/fluent.css";
import "./app.css";
import { AuthenticationStateProvider, createTsazorApp, NavigationManager, TsazorHttp } from "@tsazor/runtime";
import { CookieAuthenticationStateProvider } from "@tsazor/dotnet";
import { addFluent } from "@tsazor/fluent";
import routes from "virtual:tsazor-routes";
import App from "./App.tsazor";
import { FluentCmsClient } from "./api/fluent-cms";
import { ViewState } from "./ViewState";

createTsazorApp({
    root: App,
    routes,
    services: (services) => {
        // Same origin as the BFF: the session cookie travels with every request.
        const http = new TsazorHttp({ baseUrl: document.baseURI });
        services.registerValue(TsazorHttp, http);
        // Blazor: the NSwag clients on a named HttpClient that adds the API token and the user's JWT.
        // Here the BFF adds both; the generated client only knows the API.
        services.registerValue(FluentCmsClient, new FluentCmsClient(http));
        services.registerValue(AuthenticationStateProvider, new CookieAuthenticationStateProvider(http, { endpoint: "/bff/user" }));
        services.register(ViewState, (s) => new ViewState(s.get(FluentCmsClient), s.get(NavigationManager)), { lifetime: "scoped" });
        addFluent(services);
    },
});
