import { AuthenticationStateProvider, createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import { BakeryAuth } from "./BakeryAuth";

const auth = new BakeryAuth();

createTsazorApp({
    root: App,
    services: (services) => {
        // One instance under two keys: pages inject BakeryAuth to sign in,
        // the auth components ask for the AuthenticationStateProvider.
        services.registerValue(BakeryAuth, auth);
        services.registerValue(AuthenticationStateProvider, auth);
    },
});
