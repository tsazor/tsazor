import { createTasorApp, AuthenticationStateProvider, type Token } from "@tasor/runtime";
import App from "./App.tazor";
import routes from "virtual:tasor-routes";
import { DemoAuthProvider } from "./DemoAuthProvider";
import "bootstrap/dist/css/bootstrap.min.css";
import "./app.css";

const authProvider = new DemoAuthProvider();

const app = createTasorApp({
  root: App,
  routes,
  // One instance under both tokens: the concrete class (for @inject in
  // pages) and the base (for AuthorizeView & Co.). Blazor:
  // AddScoped<AuthenticationStateProvider, MyProvider>().
  services: (services) => {
    services.registerValue(DemoAuthProvider, authProvider);
    services.registerValue(AuthenticationStateProvider as Token<AuthenticationStateProvider>, authProvider);
  },
});

// Convenience for browser-console experimentation.
declare global {
  interface Window {
    __tasorApp: typeof app;
  }
}
window.__tasorApp = app;