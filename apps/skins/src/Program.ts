import { createTsazorApp } from "@tsazor/runtime";
import { Toaster } from "@tsazor/bootstrap";
import App from "./App.tsazor";
import routes from "virtual:tsazor-routes";
import { skin } from "./skin";
import "@tsazor/markdown/markdown.css";
import "./app.css";

// The skin's stylesheet: the one thing besides the package that differs.
if (skin === "fluent") await import("@tsazor/fluent/fluent.css");
else {
  await import("bootstrap/dist/css/bootstrap.min.css");
  // What Bootstrap has no classes for (Timeline, …), in its variables.
  await import("@tsazor/bootstrap/tsazor-bootstrap.css");
}
document.documentElement.dataset.skin = skin;

createTsazorApp({
  root: App,
  routes,
  services: (services) => {
    services.registerType(Toaster, { singleton: true });
  },
});
