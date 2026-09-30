import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";
import { SleipnirClient } from "./api";
import TickerStore from "./TickerStore";
import "bootstrap/dist/css/bootstrap.min.css";

// The generated client (sleipnir-codegen) is the entire data layer. SSE
// events flow through the vite dev proxy (same-origin); REST calls use the
// /api/sleipnir/json envelope. No WS probe (defaultTransport: rest).
const client = new SleipnirClient(window.location.origin, { defaultTransport: "rest" });
const store = new TickerStore(client);

const app = createTsazorApp({
  root: App,
  routes,
  services: (services) => {
    services.registerValue(SleipnirClient, client);
    services.registerValue(TickerStore, store);
  },
});

declare global {
  interface Window {
    __tsazorApp: typeof app;
  }
}
window.__tsazorApp = app;