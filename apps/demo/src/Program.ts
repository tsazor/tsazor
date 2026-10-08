import { createTsazorApp, AuthenticationStateProvider } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";
import { DemoAuthProvider } from "./DemoAuthProvider";
import { CounterState } from "./CounterState";
import { CsvWorker } from "./workers/csv-worker";
import { Toaster } from "@tsazor/bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import "./app.css";

const authProvider = new DemoAuthProvider();

const app = createTsazorApp({
  root: App,
  routes,
  // Served under a strict CSP (scripts/verify-csp.mjs): style attributes via the CSSOM.
  strictCsp: true,
  // One instance under both tokens: the concrete class (for @inject in
  // pages) and the base (for AuthorizeView & Co.). Blazor:
  // AddScoped<AuthenticationStateProvider, MyProvider>().
  services: (services) => {
    services.registerValue(DemoAuthProvider, authProvider);
    services.registerValue(AuthenticationStateProvider, authProvider);
    // App-wide state that outlives page navigation (/counter-persistent).
    services.registerValue(CounterState, new CounterState());
    // The CSV worker (/worker): one client for the app; the worker starts on the first call.
    services.registerType(CsvWorker, { singleton: true });
    // The app's toasts (ToastRegion in the layout shows them).
    services.registerType(Toaster, { singleton: true });
  },
});

// Convenience for browser-console experimentation.
declare global {
  interface Window {
    __tsazorApp: typeof app;
  }
}
window.__tsazorApp = app;