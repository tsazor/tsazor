import { AuthenticationStateProvider, createTsazorApp, TsazorHttp } from "@tsazor/runtime";
import App from "./App.tsazor";
import { BakeryAuth } from "./BakeryAuth";
import { bakeryApi } from "./BakeryApi";

const auth = new BakeryAuth();

// The HTTP client for the bakery's server. A real app leaves out `fetch`
// and sends over the network; here BakeryApi.ts answers in memory.
const http = new TsazorHttp({ baseUrl: "https://bakery.example", fetch: bakeryApi });

createTsazorApp({
    root: App,
    services: (services) => {
        // One instance under two keys: pages inject BakeryAuth to sign in,
        // the auth components ask for the AuthenticationStateProvider.
        services.registerValue(BakeryAuth, auth);
        services.registerValue(AuthenticationStateProvider, auth);
        services.registerValue(TsazorHttp, http);
    },
});
