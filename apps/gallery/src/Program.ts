import { createTsazorApp } from "@tsazor/runtime";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";
import { ThemeState } from "./ThemeState";
import "@tsazor/fluent/fluent.css";
import "./theme.css";

// Theme is pinned on <html> immediately (before the app mounts) so the first
// paint already matches the OS preference; the provider then renders inside.
const themeState = new ThemeState();
themeState.setTheme(themeState.theme);

const app = createTsazorApp({
  root: App,
  routes,
  services: (services) => {
    services.registerValue(ThemeState, themeState);
  },
});

declare global {
  interface Window {
    __tsazorApp: typeof app;
  }
}
window.__tsazorApp = app;