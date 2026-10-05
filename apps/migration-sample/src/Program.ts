import { AuthenticationStateProvider, createTsazorApp, TsazorHttp, type Token } from "@tsazor/runtime";
import { CookieAuthenticationStateProvider } from "@tsazor/dotnet";
import routes from "virtual:tsazor-routes";
import App from "./App.tsazor";
import { OrdersClient } from "./orders-client";

// Same origin as the Blazor app (the gateway): the sign-in cookie travels with every request.
const http = new TsazorHttp();

createTsazorApp({
    root: App,
    routes,
    services: (services) => {
        services.registerValue(TsazorHttp, http);
        services.registerValue(AuthenticationStateProvider as Token<AuthenticationStateProvider>, new CookieAuthenticationStateProvider(http));
        services.register(OrdersClient, (s) => new OrdersClient(s.get(TsazorHttp)));
    },
});
