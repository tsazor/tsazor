import { createTasorApp, AuthenticationStateProvider, type Token } from "@tasor/runtime";
import App from "./App.tazor";
import routes from "virtual:tasor-routes";
import { AuthProvider } from "./AuthProvider";
import { OrderState } from "./OrderState";
import { OrdersClient } from "./OrdersClient";
import "bootstrap/dist/css/bootstrap.min.css";
import "../wwwroot/css/site.css";

const authProvider = new AuthProvider();

const app = createTasorApp({
  root: App,
  routes,
  // One instance under both tokens: the concrete class (for @inject in
  // pages) and the base (for AuthorizeView & Co.). Blazor:
  // AddScoped<AuthenticationStateProvider, MyProvider>().
  services: (services) => {
    services.registerValue(AuthProvider, authProvider);
    services.registerValue(AuthenticationStateProvider as Token<AuthenticationStateProvider>, authProvider);
    services.registerValue(OrderState, new OrderState());
    services.registerValue(OrdersClient, new OrdersClient());
  },
});

declare global {
  interface Window {
    __tasorApp: typeof app;
  }
}
window.__tasorApp = app;